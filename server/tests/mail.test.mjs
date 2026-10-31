import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, insert } from "../db.mjs";
import { queueEmail, deliverOutbox } from "../mail.mjs";

function setup(t) {
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
    EMAIL_ALLOWED_RECIPIENTS: "old-owner@brightloop.dev",
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
  for (const email of [
    "judge@brightloop.dev",
    "second@brightloop.dev",
    "third@brightloop.dev",
  ])
    insert(db, "users", {
      name: "Registered judge",
      email,
      password_hash: "unused",
      role: "customer",
    });
  return db;
}
const age = (db) => {
  db.exec(
    "UPDATE outbox SET created_at=datetime('now','-6 minutes'); UPDATE email_attempts SET created_at=datetime('now','-6 minutes');",
  );
};

test("registered recipients bypass the old demo allowlist; strangers and fictional addresses cannot send", async (t) => {
  const db = setup(t);
  let calls = 0;
  queueEmail(db, "customer@brightloop.demo", "Invoice", "Sample");
  queueEmail(db, "stranger@brightloop.dev", "Invoice", "Sample");
  queueEmail(db, "judge@brightloop.dev", "Invoice", "Details");
  await deliverOutbox(db, {
    fetchEmail: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.brevo.com/v3/smtp/email");
      assert.equal(
        JSON.parse(options.body).to[0].email,
        "judge@brightloop.dev",
      );
      return { ok: true };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(
    db
      .prepare("SELECT status FROM outbox ORDER BY id")
      .all()
      .map((r) => r.status),
    ["failed", "failed", "sent"],
  );
  assert.throws(
    () => queueEmail(db, "JUDGE@brightloop.dev", "Again", "Details"),
    { status: 429 },
  );
});

test("failed attempts and manual retries consume durable recipient and global budgets", async (t) => {
  const db = setup(t);
  const id = queueEmail(db, "judge@brightloop.dev", "Invoice", "Details");
  let calls = 0;
  const fetchEmail = async () => {
    calls++;
    return { ok: false, status: 429 };
  };
  await deliverOutbox(db, { fetchEmail });
  db.prepare("UPDATE outbox SET status='queued' WHERE id=?").run(id);
  await deliverOutbox(db, { fetchEmail });
  assert.equal(calls, 1, "retry cannot bypass cooldown");
  for (let n = 0; n < 4; n++) {
    age(db);
    db.prepare("UPDATE outbox SET status='queued' WHERE id=?").run(id);
    await deliverOutbox(db, { fetchEmail });
  }
  age(db);
  db.prepare("UPDATE outbox SET status='queued' WHERE id=?").run(id);
  await deliverOutbox(db, { fetchEmail });
  assert.equal(
    calls,
    5,
    "five attempts per recipient per day, including failures",
  );
  for (let n = 0; n < 35; n++)
    insert(db, "email_attempts", {
      outbox_id: id,
      recipient: `other${n}@brightloop.dev`,
      security: 0,
    });
  queueEmail(db, "second@brightloop.dev", "Invoice", "Details");
  await deliverOutbox(db, { fetchEmail });
  assert.equal(
    calls,
    5,
    "invoice traffic cannot consume the last ten reserved attempts",
  );
  queueEmail(
    db,
    "third@brightloop.dev",
    "Reset",
    "https://app.test/?reset=secret",
  );
  await deliverOutbox(db, { fetchEmail });
  assert.equal(calls, 6, "security email can use reserved capacity");
  for (let n = 0; n < 9; n++)
    insert(db, "email_attempts", {
      outbox_id: id,
      recipient: `last${n}@brightloop.dev`,
      security: 1,
    });
  age(db);
  db.exec("UPDATE outbox SET status='queued' WHERE status='failed'");
  await deliverOutbox(db, { fetchEmail });
  assert.equal(calls, 6, "hard cap of fifty total attempts");
});

test("expired security links never reach the provider and queue growth is bounded", async (t) => {
  const db = setup(t);
  const id = queueEmail(
    db,
    "judge@brightloop.dev",
    "Reset",
    "https://app.test/?reset=secret",
  );
  db.prepare(
    "UPDATE outbox SET created_at=datetime('now','-31 minutes') WHERE id=?",
  ).run(id);
  await deliverOutbox(db, {
    fetchEmail: async () => {
      assert.fail("expired reset sent");
    },
  });
  assert.equal(
    db.prepare("SELECT status FROM outbox WHERE id=?").get(id).status,
    "failed",
  );
  for (let n = 0; n < 100; n++)
    insert(db, "outbox", {
      recipient: `load${n}@brightloop.dev`,
      subject: "Invoice",
      body: "Details",
    });
  assert.throws(
    () => queueEmail(db, "second@brightloop.dev", "Invoice", "Details"),
    { status: 429 },
  );
});
