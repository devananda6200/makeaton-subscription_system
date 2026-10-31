import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.mjs";
import { queueEmail, deliverOutbox } from "../mail.mjs";

test("Brevo delivery protects demo recipients, handles failures and caps daily sends", async (t) => {
  const keys = [
    "BREVO_API_KEY",
    "MAIL_FROM_EMAIL",
    "EMAIL_ALLOWED_RECIPIENTS",
    "DEMO_MODE",
  ];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    BREVO_API_KEY: "test-key",
    MAIL_FROM_EMAIL: "sender@brightloop.dev",
    EMAIL_ALLOWED_RECIPIENTS: "judge@brightloop.dev",
    DEMO_MODE: "true",
  });
  const db = openDatabase(":memory:");
  t.after(() => {
    db.close();
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  });
  let calls = 0;
  const fetchEmail = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(options.headers["api-key"], "test-key");
    assert.equal(JSON.parse(options.body).to[0].email, "judge@brightloop.dev");
    return { ok: true };
  };
  queueEmail(db, "customer@brightloop.demo", "Invoice", "Sample");
  queueEmail(db, "stranger@brightloop.dev", "Invoice", "Sample");
  queueEmail(db, "judge@brightloop.dev", "Invoice", "Invoice details");
  await deliverOutbox(db, { fetchEmail });
  assert.equal(calls, 1);
  assert.deepEqual(
    db
      .prepare("SELECT status FROM outbox ORDER BY id")
      .all()
      .map((r) => r.status),
    ["failed", "failed", "sent"],
  );
  const expired = queueEmail(
    db,
    "judge@brightloop.dev",
    "Reset",
    "https://app.test/?reset=secret",
  );
  db.prepare(
    "UPDATE outbox SET created_at=datetime('now','-31 minutes') WHERE id=?",
  ).run(expired);
  await deliverOutbox(db, { fetchEmail });
  assert.equal(calls, 1);
  const rejected = queueEmail(db, "judge@brightloop.dev", "Invoice", "Details");
  await deliverOutbox(db, {
    fetchEmail: async () => ({ ok: false, status: 429 }),
  });
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(rejected).status,
    "failed",
  );
  for (let i = 0; i < 49; i++) {
    const id = queueEmail(db, "judge@brightloop.dev", "Invoice", "Details");
    db.prepare(
      "UPDATE outbox SET status='sent',sent_at=datetime('now') WHERE id=?",
    ).run(id);
  }
  const deferred = queueEmail(db, "judge@brightloop.dev", "Invoice", "Details");
  await deliverOutbox(db, { fetchEmail });
  assert.equal(calls, 1);
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(deferred).status,
    "queued",
  );
});
