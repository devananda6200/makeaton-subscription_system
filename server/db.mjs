import { DatabaseSync } from "node:sqlite";
import LibsqlDatabase from "libsql";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function openDatabase(
  filename = process.env.DATABASE_PATH || "./data/brightloop.db",
) {
  const remote = arguments.length === 0 && process.env.TURSO_DATABASE_URL;
  if (
    arguments.length === 0 &&
    process.env.REQUIRE_REMOTE_DATABASE === "true" &&
    !remote
  )
    throw new Error(
      "A durable TURSO_DATABASE_URL is required on free hosting.",
    );
  if (remote && !process.env.TURSO_AUTH_TOKEN)
    throw new Error("TURSO_AUTH_TOKEN is required for the remote database.");
  if (!remote && filename !== ":memory:")
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = remote
    ? new LibsqlDatabase(remote, { authToken: process.env.TURSO_AUTH_TOKEN })
    : process.env.DATABASE_DRIVER === "libsql"
      ? new LibsqlDatabase(filename)
      : new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys=ON;");
  if (!remote) db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      company TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff','customer')),
      customer_id INTEGER REFERENCES customers(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS taxes (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, rate_bps INTEGER NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000)
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
      cost INTEGER NOT NULL CHECK(cost>=0), notes TEXT NOT NULL DEFAULT '', variants TEXT NOT NULL DEFAULT '[]',
      tax_id INTEGER REFERENCES taxes(id), archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL CHECK(price>=0),
      interval TEXT NOT NULL CHECK(interval IN ('daily','weekly','monthly','yearly')), min_quantity INTEGER NOT NULL DEFAULT 1,
      available_from TEXT NOT NULL, available_until TEXT, auto_close INTEGER NOT NULL DEFAULT 1,
      allow_pause INTEGER NOT NULL DEFAULT 1, allow_close INTEGER NOT NULL DEFAULT 1, allow_renew INTEGER NOT NULL DEFAULT 1,
      tax_id INTEGER REFERENCES taxes(id), archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, plan_id INTEGER NOT NULL REFERENCES plans(id),
      valid_days INTEGER NOT NULL DEFAULT 30, lines TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, customer_id INTEGER NOT NULL REFERENCES customers(id),
      plan_id INTEGER NOT NULL REFERENCES plans(id), status TEXT NOT NULL CHECK(status IN ('draft','quotation','confirmed','active','paused','closed')),
      start_date TEXT NOT NULL, expiry_date TEXT NOT NULL, next_billing TEXT NOT NULL, anchor_day INTEGER NOT NULL,
      payment_terms INTEGER NOT NULL DEFAULT 14, plan_price INTEGER NOT NULL, billing_interval TEXT NOT NULL,
      lines TEXT NOT NULL, quote_until TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS discounts (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('fixed','percentage')),
      value INTEGER NOT NULL CHECK(value>0), min_purchase INTEGER NOT NULL DEFAULT 0, min_quantity INTEGER NOT NULL DEFAULT 0,
      starts_on TEXT NOT NULL, ends_on TEXT NOT NULL, usage_limit INTEGER NOT NULL DEFAULT 100,
      uses INTEGER NOT NULL DEFAULT 0, product_id INTEGER REFERENCES products(id),
      subscription_id INTEGER REFERENCES subscriptions(id), enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id), customer_snapshot TEXT NOT NULL,
      cycle_date TEXT NOT NULL, issued_on TEXT NOT NULL, due_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft','confirmed','paid','cancelled')),
      lines TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL, tax INTEGER NOT NULL,
      total INTEGER NOT NULL CHECK(total>=0), paid INTEGER NOT NULL DEFAULT 0 CHECK(paid>=0 AND paid<=total),
      discount_ids TEXT NOT NULL DEFAULT '[]', sent_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(subscription_id,cycle_date)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id), amount INTEGER NOT NULL CHECK(amount>0),
      method TEXT NOT NULL, paid_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), actor TEXT NOT NULL, action TEXT NOT NULL,
      entity TEXT NOT NULL, entity_id INTEGER, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_subscription_due ON subscriptions(status,next_billing);
    CREATE INDEX IF NOT EXISTS idx_subscription_customer ON subscriptions(customer_id,status);
    CREATE INDEX IF NOT EXISTS idx_invoice_customer ON invoices(customer_id,issued_on);
    CREATE INDEX IF NOT EXISTS idx_invoice_due ON invoices(status,due_date);
    CREATE INDEX IF NOT EXISTS idx_payment_date ON payments(paid_on);
    CREATE INDEX IF NOT EXISTS idx_payment_invoice ON payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_session_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(id DESC);
  `);
  if (
    remote &&
    existsSync(filename) &&
    !db.prepare("SELECT COUNT(*) n FROM users").get().n
  ) {
    const source = new DatabaseSync(filename, { readOnly: true });
    try {
      // Copy the current workspace once, while the old Render disk is attached.
      // Existing remote workspaces are never overwritten on subsequent boots.
      db.exec(
        "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)",
      );
      const tables = [
        "customers",
        "users",
        "taxes",
        "products",
        "plans",
        "templates",
        "subscriptions",
        "discounts",
        "invoices",
        "payments",
        "sessions",
        "password_resets",
        "audit_log",
        "outbox",
        "app_meta",
      ];
      transaction(db, () => {
        for (const table of tables) {
          for (const row of source.prepare(`SELECT * FROM ${table}`).all())
            insert(db, table, row);
        }
      });
      console.log("Existing workspace migrated to durable remote storage.");
    } finally {
      source.close();
    }
  }
  return db;
}

export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function audit(db, user, action, entity, id, detail = "") {
  db.prepare(
    "INSERT INTO audit_log(user_id,actor,action,entity,entity_id,detail) VALUES(?,?,?,?,?,?)",
  ).run(
    user?.id ?? null,
    user?.name || "Billing engine",
    action,
    entity,
    id ?? null,
    detail,
  );
}

export function insert(db, table, value) {
  const keys = Object.keys(value);
  const result = db
    .prepare(
      `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    )
    .run(
      ...Object.values(value).map((v) =>
        typeof v === "boolean" ? Number(v) : v,
      ),
    );
  return Number(result.lastInsertRowid);
}

export function update(db, table, id, value) {
  const keys = Object.keys(value);
  db.prepare(
    `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`,
  ).run(
    ...Object.values(value).map((v) =>
      typeof v === "boolean" ? Number(v) : v,
    ),
    id,
  );
}
