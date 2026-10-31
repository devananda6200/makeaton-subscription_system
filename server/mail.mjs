import nodemailer from "nodemailer";
import { insert, transaction } from "./db.mjs";
import { HttpError } from "./domain.mjs";

// Shared across all public routes and persisted across free-host restarts.
export function canQueueEmail(db, recipient) {
  const counts = db
    .prepare(
      `SELECT COUNT(*) n,
    SUM(CASE WHEN recipient=? COLLATE NOCASE THEN 1 ELSE 0 END) recipient_count,
    SUM(CASE WHEN recipient=? COLLATE NOCASE AND created_at>datetime('now','-5 minutes') THEN 1 ELSE 0 END) recent
    FROM outbox WHERE created_at>=datetime('now','start of day')`,
    )
    .get(recipient, recipient);
  return counts.n < 100 && counts.recipient_count < 5 && !counts.recent;
}

export function queueEmail(db, recipient, subject, body) {
  recipient = recipient.trim().toLowerCase();
  if (!canQueueEmail(db, recipient))
    throw new HttpError(
      429,
      "Email limit reached. Wait five minutes or try tomorrow if the daily allowance is used.",
    );
  return insert(db, "outbox", { recipient, subject, body });
}

export function emailMode() {
  return process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL
    ? "brevo"
    : process.env.SMTP_HOST
      ? "smtp"
      : "outbox";
}

let sending = false;
export async function deliverOutbox(db, { fetchEmail = fetch } = {}) {
  if (emailMode() === "outbox" || sending) return;
  sending = true;
  try {
    // A crash after provider acceptance is ambiguous: require an explicit retry,
    // never automatically resend a message that might already have arrived.
    db.prepare(
      `UPDATE outbox SET status='failed',error='Delivery outcome unknown after interruption. Check the inbox before retrying.'
      WHERE status='sending' AND id IN (SELECT outbox_id FROM email_attempts WHERE created_at<datetime('now','-20 minutes'))`,
    ).run();
    const transport =
      emailMode() === "smtp"
        ? nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_PORT === "465",
            auth: process.env.SMTP_USER
              ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              : undefined,
            connectionTimeout: 10000,
            socketTimeout: 15000,
          })
        : null;
    for (const mail of db
      .prepare(
        "SELECT * FROM outbox WHERE status='queued' ORDER BY (body LIKE '%?reset=%') DESC,id LIMIT 100",
      )
      .all()) {
      try {
        const recipient = mail.recipient.trim().toLowerCase();
        if (
          /@(?:[^@]*\.)?(?:example\.(?:com|org|net)|invalid|test|demo)$/.test(
            recipient,
          )
        )
          throw new Error("Fictional recipient: delivery disabled.");
        if (!db.prepare("SELECT id FROM users WHERE email=?").get(recipient))
          throw new Error(
            "Recipient must have a registered Brightloop account.",
          );
        if (
          mail.body.includes("?reset=") &&
          Date.parse(mail.created_at + "Z") < Date.now() - 30 * 60000
        )
          throw new Error(
            "Reset link expired. Request a fresh password reset.",
          );
        if (Date.parse(mail.created_at + "Z") < Date.now() - 86400000)
          throw new Error(
            "Email provider delivery window expired. Send a fresh invoice instead.",
          );
        // Reserve BEFORE calling the provider. Failed/ambiguous requests consume
        // budget too; concurrent workers and manual retries cannot bypass it.
        const claimed = transaction(db, () => {
          const security = mail.body.includes("?reset=") ? 1 : 0;
          const counts = db
            .prepare(
              `SELECT COUNT(*) n,
            SUM(CASE WHEN recipient=? THEN 1 ELSE 0 END) recipient_count,
            SUM(CASE WHEN recipient=? AND created_at>datetime('now','-5 minutes') THEN 1 ELSE 0 END) recent
            FROM email_attempts WHERE created_at>=datetime('now','start of day')`,
            )
            .get(recipient, recipient);
          if (
            counts.n >= (security ? 50 : 40) ||
            counts.recipient_count >= 5 ||
            counts.recent
          ) {
            db.prepare(
              "UPDATE outbox SET error=? WHERE id=? AND status='queued'",
            ).run(
              "Delivery deferred by the free email allowance or five-minute recipient cooldown.",
              mail.id,
            );
            return false;
          }
          const updated = db
            .prepare(
              "UPDATE outbox SET status='sending',error=NULL WHERE id=? AND status='queued'",
            )
            .run(mail.id);
          if (!updated.changes) return false;
          insert(db, "email_attempts", {
            outbox_id: mail.id,
            recipient,
            security,
          });
          return true;
        });
        if (!claimed) continue;
        if (transport) {
          await transport.sendMail({
            from: process.env.MAIL_FROM,
            to: recipient,
            subject: mail.subject,
            text: mail.body,
          });
        } else {
          const response = await fetchEmail(
            "https://api.brevo.com/v3/smtp/email",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "api-key": process.env.BREVO_API_KEY,
              },
              body: JSON.stringify({
                sender: {
                  name: "Brightloop",
                  email: process.env.MAIL_FROM_EMAIL,
                },
                to: [{ email: recipient }],
                subject: mail.subject,
                textContent: mail.body,
              }),
              signal: AbortSignal.timeout(15000),
            },
          );
          if (!response.ok)
            throw new Error(
              `Email provider rejected delivery (HTTP ${response.status}).`,
            );
        }
        db.prepare(
          "UPDATE outbox SET status='sent',sent_at=datetime('now'),error=NULL WHERE id=?",
        ).run(mail.id);
      } catch (error) {
        db.prepare("UPDATE outbox SET status='failed',error=? WHERE id=?").run(
          error.message.startsWith("Fictional") ||
            error.message.startsWith("Recipient") ||
            error.message.startsWith("Reset link") ||
            error.message.startsWith("Email provider")
            ? error.message
            : "Delivery failed. Check email configuration and retry.",
          mail.id,
        );
      }
    }
  } finally {
    sending = false;
  }
}
