import nodemailer from 'nodemailer';
import { insert } from './db.mjs';

export function queueEmail(db, recipient, subject, body) {
  return insert(db, 'outbox', { recipient, subject, body });
}

let sending = false;
export async function deliverOutbox(db) {
  if (!process.env.SMTP_HOST || sending) return;
  sending = true;
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_PORT === '465',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10000, socketTimeout: 15000,
    });
    for (const mail of db.prepare("SELECT * FROM outbox WHERE status='queued' ORDER BY id LIMIT 20").all()) {
      try {
        await transport.sendMail({ from: process.env.MAIL_FROM || 'Brightloop <billing@example.com>', to: mail.recipient, subject: mail.subject, text: mail.body });
        db.prepare("UPDATE outbox SET status='sent',sent_at=datetime('now'),error=NULL WHERE id=?").run(mail.id);
      } catch {
        db.prepare("UPDATE outbox SET status='failed',error='Delivery failed. Check SMTP configuration and retry.' WHERE id=?").run(mail.id);
      }
    }
  } finally { sending = false; }
}
