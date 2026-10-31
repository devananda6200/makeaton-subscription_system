import nodemailer from "nodemailer";
import { insert } from "./db.mjs";

export function queueEmail(db, recipient, subject, body) {
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
        "SELECT * FROM outbox WHERE status='queued' ORDER BY id LIMIT 20",
      )
      .all()) {
      try {
        const recipient = mail.recipient.trim().toLowerCase();
        const allowed = (process.env.EMAIL_ALLOWED_RECIPIENTS || "")
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);
        if (
          /@(?:[^@]*\.)?(?:example\.(?:com|org|net)|invalid|test|demo)$/.test(
            recipient,
          )
        )
          throw new Error("Fictional recipient: delivery disabled.");
        if (
          (process.env.DEMO_MODE === "true" || allowed.length) &&
          !allowed.includes(recipient)
        )
          throw new Error("Recipient is not enabled for this public demo.");
        if (
          mail.body.includes("?reset=") &&
          Date.parse(mail.created_at + "Z") < Date.now() - 30 * 60000
        )
          throw new Error(
            "Reset link expired. Request a fresh password reset.",
          );
        const sentToday = db
          .prepare(
            "SELECT COUNT(*) n FROM outbox WHERE status='sent' AND date(sent_at)=date('now')",
          )
          .get().n;
        if (sentToday >= 50) break; // Conservatively below Brevo Free's daily allowance.
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
