import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { insert, update, transaction, audit } from "./db.mjs";
import {
  assert,
  HttpError,
  schemas,
  hydrate,
  validateRelations,
  email,
  password,
  today,
  date,
} from "./domain.mjs";
import {
  hashPassword,
  checkPassword,
  publicUser,
  setSession,
  sessionMiddleware,
  requireUser,
  roles,
  ownRecord,
  tokenHash,
  randomToken,
} from "./auth.mjs";
import {
  createSubscription,
  transitionSubscription,
  changeSubscriptionLines,
} from "./subscriptions.mjs";
import {
  runBilling,
  recordPayment,
  invoiceAction,
  printableInvoice,
} from "./billing.mjs";
import { report, csvCell } from "./reports.mjs";
import { queueEmail, deliverOutbox, emailMode } from "./mail.mjs";

const team = roles("admin", "staff");
const admin = roles("admin");
const serialize = (data) =>
  Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      Array.isArray(v) ? JSON.stringify(v) : v,
    ]),
  );
const safeId = (value) => {
  const id = Number(value);
  assert(Number.isSafeInteger(id) && id > 0, "Invalid record ID");
  return id;
};

export function createApp(db, { demo = false } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
          "upgrade-insecure-requests":
            process.env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      assert(
        req.is("application/json"),
        "Requests must use application/json",
        415,
      );
      const origin = req.get("origin");
      const allowed = new Set([process.env.APP_URL || "http://localhost:5173"]);
      if (process.env.NODE_ENV !== "production")
        [
          "http://127.0.0.1:5173",
          "http://localhost:3001",
          "http://127.0.0.1:3001",
        ].forEach((v) => allowed.add(v));
      assert(
        req.get("sec-fetch-site") !== "cross-site" &&
          (!origin || allowed.has(origin)),
        "Untrusted request origin",
        403,
      );
    }
    next();
  });
  app.use(sessionMiddleware(db));
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again in 15 minutes." },
  });
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", service: "brightloop" }),
  );
  app.get("/api/auth/me", (req, res) =>
    res.json({
      user: req.user || null,
      demo,
      email_mode: emailMode(),
    }),
  );
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const data = z
      .object({ email, password: z.string().min(1).max(128) })
      .parse(req.body);
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(data.email);
    // Keep password work comparable for unknown accounts.
    const valid = await checkPassword(
      data.password,
      user?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    assert(user && valid, "Email or password is incorrect", 401);
    if (req.sessionHash)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        req.sessionHash,
      );
    setSession(db, res, user);
    res.json({ user: publicUser(user) });
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const data = z
      .object({
        name: z.string().trim().min(2).max(120),
        email,
        password,
        company: z.string().trim().max(160).default(""),
      })
      .parse(req.body);
    const hash = await hashPassword(data.password);
    const user = transaction(db, () => {
      assert(
        !db.prepare("SELECT id FROM users WHERE email=?").get(data.email) &&
          !db.prepare("SELECT id FROM customers WHERE email=?").get(data.email),
        "This email is already registered. Sign in, reset your password, or request a portal invitation.",
        409,
      );
      const customerId = insert(db, "customers", {
        name: data.name,
        email: data.email,
        company: data.company,
      });
      const id = insert(db, "users", {
        name: data.name,
        email: data.email,
        password_hash: hash,
        role: "customer",
        customer_id: customerId,
      });
      return db.prepare("SELECT * FROM users WHERE id=?").get(id);
    });
    setSession(db, res, user);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post("/api/auth/forgot", authLimit, (req, res) => {
    const data = z.object({ email }).parse(req.body);
    const user = db
      .prepare("SELECT id FROM users WHERE email=?")
      .get(data.email);
    if (user)
      transaction(db, () => {
        const token = randomToken();
        db.prepare(
          "DELETE FROM password_resets WHERE user_id=? OR expires_at<?",
        ).run(user.id, Date.now());
        insert(db, "password_resets", {
          token_hash: tokenHash(token),
          user_id: user.id,
          expires_at: Date.now() + 30 * 60000,
        });
        queueEmail(
          db,
          data.email,
          "Reset your Brightloop password",
          `Use this single-use link within 30 minutes:\n${process.env.APP_URL || "http://localhost:5173"}/?reset=${token}\n\nIf you did not request this, you can ignore this email.`,
        );
      });
    res.json({
      message:
        "If an account exists, a reset link has been queued for its registered email.",
    });
    void deliverOutbox(db);
  });
  app.post("/api/auth/reset", authLimit, async (req, res) => {
    const data = z
      .object({ token: z.string().length(64), password })
      .parse(req.body);
    const hash = await hashPassword(data.password);
    transaction(db, () => {
      const reset = db
        .prepare(
          "SELECT * FROM password_resets WHERE token_hash=? AND expires_at>?",
        )
        .get(tokenHash(data.token), Date.now());
      assert(reset, "Reset link has expired or has already been used");
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
        hash,
        reset.user_id,
      );
      db.prepare("DELETE FROM password_resets WHERE user_id=?").run(
        reset.user_id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(reset.user_id);
    });
    res.json({ message: "Password updated. Sign in with your new password." });
  });
  app.post("/api/auth/logout", (req, res) => {
    if (req.sessionHash)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        req.sessionHash,
      );
    res.clearCookie("brightloop_session", { path: "/" });
    res.json({ ok: true });
  });

  app.use("/api", requireUser);
  app.get("/api/subscription-catalog", (_req, res) =>
    res.json({
      items: db
        .prepare(
          "SELECT id,name,type,price,variants FROM products WHERE archived=0 ORDER BY name LIMIT 500",
        )
        .all()
        .map(hydrate),
    }),
  );
  app.put("/api/subscriptions/:id/lines", (req, res) =>
    res.json(
      changeSubscriptionLines(
        db,
        safeId(req.params.id),
        req.body.lines,
        req.user,
      ),
    ),
  );
  app.get("/api/lookups", (req, res) => {
    const customer = req.user.role === "customer";
    const q = String(req.query.q || "").slice(0, 100);
    res.json({
      products: customer
        ? []
        : db
            .prepare(
              "SELECT * FROM products WHERE archived=0 ORDER BY name LIMIT 500",
            )
            .all()
            .map(hydrate),
      plans: db
        .prepare(
          "SELECT * FROM plans WHERE archived=0 ORDER BY price LIMIT 500",
        )
        .all(),
      taxes: customer
        ? []
        : db.prepare("SELECT * FROM taxes ORDER BY name LIMIT 100").all(),
      templates: customer
        ? []
        : db
            .prepare("SELECT * FROM templates ORDER BY name LIMIT 500")
            .all()
            .map(hydrate),
      customers: customer
        ? []
        : db
            .prepare(
              "SELECT * FROM customers WHERE name LIKE ? OR company LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 500",
            )
            .all(`%${q}%`, `%${q}%`, `%${q}%`),
      subscriptions: customer
        ? []
        : db
            .prepare(
              "SELECT s.id,s.number,c.name customer_name,c.company FROM subscriptions s JOIN customers c ON c.id=s.customer_id WHERE s.number LIKE ? OR c.name LIKE ? OR c.company LIKE ? ORDER BY s.id DESC LIMIT 500",
            )
            .all(`%${q}%`, `%${q}%`, `%${q}%`),
    });
  });
  app.get("/api/reports", (req, res) =>
    res.json(report(db, req.user, req.query)),
  );
  app.get("/api/reports/export", team, (req, res) => {
    const r = report(db, req.user, req.query);
    const rows = [
      ["Brightloop report", "INR"],
      ["From", r.from],
      ["To", r.to],
      ["Active subscriptions", r.active],
      ["MRR (before discounts and tax)", r.mrr / 100],
      ["Cash collected (including tax)", r.collected / 100],
      ["Outstanding confirmed invoices", r.outstanding / 100],
      ["Overdue confirmed invoices", r.overdue / 100],
      [],
      ["Month", "Collected INR", "Billed INR"],
      ...r.chart.map((m) => [m.month, m.collected / 100, m.billed / 100]),
    ];
    res
      .set(
        "Content-Disposition",
        `attachment; filename="brightloop-report-${r.from}-${r.to}.csv"`,
      )
      .type("csv")
      .send(rows.map((r) => r.map(csvCell).join(",")).join("\r\n"));
  });
  app.post("/api/billing/run", team, (req, res) =>
    res.json(runBilling(db, req.user)),
  );
  app.post("/api/subscriptions", team, (req, res) =>
    res.status(201).json(createSubscription(db, req.body, req.user)),
  );
  app.post("/api/subscriptions/:id/action", (req, res) => {
    const data = z
      .object({
        action: z.enum([
          "quote",
          "confirm",
          "activate",
          "pause",
          "resume",
          "close",
          "renew",
        ]),
        expiry_date: date.optional(),
      })
      .parse(req.body);
    res.json(
      transitionSubscription(
        db,
        safeId(req.params.id),
        data.action,
        req.user,
        data,
      ),
    );
  });
  app.post("/api/invoices/:id/action", team, (req, res) => {
    const action = z
      .enum(["confirm", "cancel", "send", "remind"])
      .parse(req.body.action);
    res.json(invoiceAction(db, safeId(req.params.id), action, req.user));
    void deliverOutbox(db);
  });
  app.post("/api/invoices/:id/payments", team, (req, res) =>
    res
      .status(201)
      .json(recordPayment(db, safeId(req.params.id), req.body, req.user)),
  );
  app.get("/api/invoices/:id/print", (req, res) => {
    const invoice = hydrate(
      ownRecord(
        req,
        db
          .prepare("SELECT * FROM invoices WHERE id=?")
          .get(safeId(req.params.id)),
      ),
    );
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    );
    res.type("html").send(printableInvoice(invoice));
  });
  app.get("/api/invoices/:id", (req, res) => {
    const invoice = hydrate(
      ownRecord(
        req,
        db
          .prepare(
            "SELECT i.*,c.name customer_name,s.number subscription_number FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN subscriptions s ON s.id=i.subscription_id WHERE i.id=?",
          )
          .get(safeId(req.params.id)),
      ),
    );
    res.json({
      ...invoice,
      payments: db
        .prepare("SELECT * FROM payments WHERE invoice_id=? ORDER BY id DESC")
        .all(invoice.id),
    });
  });
  app.get("/api/subscriptions/:id", (req, res) => {
    const sub = hydrate(
      ownRecord(
        req,
        db
          .prepare(
            "SELECT s.*,p.name plan_name,p.allow_pause,p.allow_close,p.allow_renew,c.name customer_name,c.company FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN customers c ON c.id=s.customer_id WHERE s.id=?",
          )
          .get(safeId(req.params.id)),
      ),
    );
    res.json({
      ...sub,
      invoices: db
        .prepare(
          "SELECT id,number,total,paid,status,due_date FROM invoices WHERE subscription_id=? ORDER BY id DESC LIMIT 100",
        )
        .all(sub.id),
    });
  });
  app.post("/api/staff", admin, async (req, res) => {
    const data = z
      .object({ name: z.string().trim().min(2).max(120), email, password })
      .parse(req.body);
    assert(
      !db.prepare("SELECT id FROM users WHERE email=?").get(data.email),
      "Email already exists",
      409,
    );
    const id = insert(db, "users", {
      name: data.name,
      email: data.email,
      password_hash: await hashPassword(data.password),
      role: "staff",
    });
    audit(db, req.user, "Added staff member", "user", id, data.name);
    res
      .status(201)
      .json(publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id)));
  });
  app.get("/api/staff", admin, (req, res) =>
    res.json({
      items: db
        .prepare(
          "SELECT id,name,email,role,created_at FROM users WHERE role IN ('admin','staff') AND (name LIKE ? OR email LIKE ?) ORDER BY id LIMIT 100",
        )
        .all(
          `%${String(req.query.q || "").slice(0, 100)}%`,
          `%${String(req.query.q || "").slice(0, 100)}%`,
        ),
    }),
  );
  app.post("/api/customers/:id/invite", admin, async (req, res) => {
    const customer = db
      .prepare("SELECT * FROM customers WHERE id=?")
      .get(safeId(req.params.id));
    assert(customer, "Customer not found", 404);
    assert(
      !db.prepare("SELECT id FROM users WHERE email=?").get(customer.email),
      "This email already has an account; use password reset instead",
      409,
    );
    const hash = await hashPassword(randomUUID() + "Aa!");
    transaction(db, () => {
      const id = insert(db, "users", {
        name: customer.name,
        email: customer.email,
        role: "customer",
        customer_id: customer.id,
        password_hash: hash,
      });
      const token = randomToken();
      insert(db, "password_resets", {
        token_hash: tokenHash(token),
        user_id: id,
        expires_at: Date.now() + 30 * 60000,
      });
      queueEmail(
        db,
        customer.email,
        "Your Brightloop portal invitation",
        `Welcome ${customer.name}! Set your password within 30 minutes:\n${process.env.APP_URL || "http://localhost:5173"}/?reset=${token}`,
      );
      audit(
        db,
        req.user,
        "Invited customer to portal",
        "customer",
        customer.id,
        customer.name,
      );
    });
    res.json({ message: "Portal invitation queued" });
    void deliverOutbox(db);
  });
  app.get("/api/activity", team, (_req, res) =>
    res.json({
      items: db
        .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 60")
        .all(),
    }),
  );
  app.get("/api/outbox", admin, (_req, res) =>
    res.json({
      items: db
        .prepare("SELECT * FROM outbox ORDER BY id DESC LIMIT 60")
        .all()
        .map((mail) => ({
          ...mail,
          body: mail.body.includes("?reset=")
            ? "Account security link hidden. Check the recipient inbox."
            : mail.body,
        })),
      mode: emailMode(),
    }),
  );
  app.post("/api/outbox/:id/retry", admin, (req, res) => {
    const mail = db
      .prepare("SELECT id FROM outbox WHERE id=?")
      .get(safeId(req.params.id));
    assert(mail, "Message not found", 404);
    db.prepare(
      "UPDATE outbox SET status='queued',error=NULL WHERE id=? AND status='failed'",
    ).run(mail.id);
    res.json({ ok: true });
    void deliverOutbox(db);
  });
  const listConfig = {
    customers: {
      from: "customers c",
      select: "c.*",
      search: ["c.name", "c.email", "c.company"],
      alias: "c",
      role: "team",
    },
    products: {
      from: "products p",
      select: "p.*",
      search: ["p.name", "p.type"],
      alias: "p",
      role: "team",
    },
    plans: {
      from: "plans p",
      select: "p.*",
      search: ["p.name", "p.interval"],
      alias: "p",
      role: "team",
    },
    taxes: {
      from: "taxes t",
      select: "t.*",
      search: ["t.name"],
      alias: "t",
      role: "admin",
    },
    discounts: {
      from: "discounts d LEFT JOIN products p ON p.id=d.product_id LEFT JOIN subscriptions s ON s.id=d.subscription_id",
      select: "d.*,p.name product_name,s.number subscription_number",
      search: ["d.name", "d.kind"],
      alias: "d",
      role: "admin",
    },
    templates: {
      from: "templates t JOIN plans p ON p.id=t.plan_id",
      select: "t.*,p.name plan_name",
      search: ["t.name", "p.name"],
      alias: "t",
      role: "team",
    },
    subscriptions: {
      from: "subscriptions s JOIN customers c ON c.id=s.customer_id JOIN plans p ON p.id=s.plan_id",
      select:
        "s.*,c.name customer_name,c.company,p.name plan_name,p.allow_pause,p.allow_close,p.allow_renew",
      search: ["s.number", "c.name", "c.company", "p.name"],
      alias: "s",
      role: "any",
    },
    invoices: {
      from: "invoices i JOIN customers c ON c.id=i.customer_id JOIN subscriptions s ON s.id=i.subscription_id",
      select: "i.*,c.name customer_name,c.company,s.number subscription_number",
      search: ["i.number", "c.name", "c.company", "s.number"],
      alias: "i",
      role: "any",
    },
    payments: {
      from: "payments p JOIN invoices i ON i.id=p.invoice_id JOIN customers c ON c.id=i.customer_id",
      select: "p.*,i.number invoice_number,c.name customer_name,c.company",
      search: ["i.number", "c.name", "p.method", "p.note"],
      alias: "p",
      role: "team",
    },
  };
  app.get("/api/:collection", (req, res, next) => {
    const c = Object.hasOwn(listConfig, req.params.collection)
      ? listConfig[req.params.collection]
      : null;
    if (!c) return next();
    assert(
      c.role === "any" ||
        (c.role === "admin"
          ? req.user.role === "admin"
          : req.user.role !== "customer"),
      "Permission denied",
      403,
    );
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    assert(
      Number.isInteger(page) && Number.isInteger(limit),
      "Invalid pagination",
    );
    const q = String(req.query.q || "").slice(0, 100);
    const where = [`(${c.search.map((k) => `${k} LIKE ?`).join(" OR ")})`];
    const params = c.search.map(() => `%${q}%`);
    if (req.user.role === "customer") {
      where.push(`${c.alias}.customer_id=?`);
      params.push(req.user.customer_id);
    }
    if (
      req.query.status &&
      ["subscriptions", "invoices"].includes(req.params.collection)
    ) {
      if (
        req.query.status === "overdue" &&
        req.params.collection === "invoices"
      ) {
        where.push("i.status='confirmed' AND i.due_date<?");
        params.push(today());
      } else {
        where.push(`${c.alias}.status=?`);
        params.push(String(req.query.status));
      }
    }
    const clause = `WHERE ${where.join(" AND ")}`;
    const total = db
      .prepare(`SELECT COUNT(*) count FROM ${c.from} ${clause}`)
      .get(...params).count;
    const items = db
      .prepare(
        `SELECT ${c.select} FROM ${c.from} ${clause} ORDER BY ${c.alias}.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, (page - 1) * limit)
      .map(hydrate);
    res.json({ items, total, page, limit });
  });
  app.post("/api/:collection", (req, res, next) => {
    const table = req.params.collection;
    const schema = Object.hasOwn(schemas, table) ? schemas[table] : null;
    if (!schema) return next();
    assert(
      req.user.role === "admin" ||
        (req.user.role === "staff" && table === "customers"),
      "Only an admin can manage this configuration",
      403,
    );
    const value = schema.parse(req.body);
    validateRelations(db, table, value);
    const id = transaction(db, () => {
      const id = insert(db, table, serialize(value));
      audit(
        db,
        req.user,
        `Created ${table.replace(/s$/, "")}`,
        table,
        id,
        value.name,
      );
      return id;
    });
    res
      .status(201)
      .json(hydrate(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id)));
  });
  app.put("/api/:collection/:id", (req, res, next) => {
    const table = req.params.collection;
    const schema = Object.hasOwn(schemas, table) ? schemas[table] : null;
    if (!schema) return next();
    assert(
      req.user.role === "admin" ||
        (req.user.role === "staff" && table === "customers"),
      "Only an admin can manage this configuration",
      403,
    );
    const id = safeId(req.params.id);
    const old = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
    assert(old, "Record not found", 404);
    const value = schema.parse(req.body);
    validateRelations(db, table, value);
    if (table === "discounts")
      assert(
        value.usage_limit >= old.uses,
        "Usage limit cannot be below the number already redeemed",
      );
    if (table === "customers" && old.email !== value.email)
      assert(
        !db.prepare("SELECT id FROM users WHERE customer_id=?").get(id),
        "The email of an activated portal account cannot be changed here",
      );
    transaction(db, () => {
      update(db, table, id, serialize(value));
      audit(
        db,
        req.user,
        `Updated ${table.replace(/s$/, "")}`,
        table,
        id,
        value.name,
      );
    });
    res.json(hydrate(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id)));
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "API endpoint not found")),
  );
  if (existsSync(resolve("dist/index.html"))) {
    app.use(express.static(resolve("dist")));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve("dist/index.html")),
    );
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; "),
      });
    if (error.message?.includes("UNIQUE constraint"))
      return res.status(409).json({
        error: "This record already exists. Use a unique email or reference.",
      });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "Invalid JSON body" });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "Request is too large" });
    if (!error.status) console.error("Request failed:", error.message);
    res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : "An unexpected error occurred. Please try again.",
    });
  });
  return app;
}
