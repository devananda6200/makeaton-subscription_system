import { performance } from "node:perf_hooks";
import { mkdtempSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { openDatabase, insert, transaction } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { today, addDays } from "../server/domain.mjs";
import { tokenHash } from "../server/auth.mjs";
import { runBilling } from "../server/billing.mjs";

const dir = mkdtempSync(join(tmpdir(), "brightloop-benchmark-"));
const file = join(dir, "benchmark.db");
const db = openDatabase(file);
const count = 10000;
let server;
try {
  console.log(
    `Building isolated fixture: ${count.toLocaleString()} subscriptions, 60,000 invoices, 50,000 receipts.`,
  );
  const lines = JSON.stringify([
    {
      product_id: 1,
      name: "Workspace seats",
      quantity: 2,
      variant: "",
      unit_price: 39900,
      tax_id: 1,
    },
  ]);
  transaction(db, () => {
    insert(db, "users", {
      name: "Benchmark user",
      email: "benchmark@example.com",
      password_hash: "unused",
      role: "admin",
    });
    insert(db, "sessions", {
      token_hash: tokenHash("benchmark-session"),
      user_id: 1,
      expires_at: Date.now() + 3600000,
    });
    insert(db, "taxes", { name: "GST", rate_bps: 1800 });
    insert(db, "products", {
      name: "Workspace seats",
      type: "software",
      price: 39900,
      cost: 10000,
      tax_id: 1,
    });
    insert(db, "plans", {
      name: "Launch",
      price: 49900,
      interval: "monthly",
      available_from: "2020-01-01",
      min_quantity: 1,
      tax_id: 1,
    });
    const customer = db.prepare(
      "INSERT INTO customers(id,name,email,company) VALUES(?,?,?,?)",
    );
    const sub = db.prepare(
      "INSERT INTO subscriptions(id,number,customer_id,plan_id,status,start_date,expiry_date,next_billing,anchor_day,payment_terms,plan_price,billing_interval,lines) VALUES(?,?,?,1,'active',?,?,?,15,14,49900,'monthly',?)",
    );
    const invoice = db.prepare(
      "INSERT INTO invoices(number,subscription_id,customer_id,customer_snapshot,cycle_date,issued_on,due_date,status,lines,subtotal,discount,tax,total,paid) VALUES(?,?,?,?,?,?,?,?,?,129700,0,23346,153046,?)",
    );
    const payment = db.prepare(
      "INSERT INTO payments(invoice_id,amount,method,paid_on,idempotency_key) VALUES(?,153046,'bank_transfer',?,?)",
    );
    for (let i = 1; i <= count; i++) {
      customer.run(
        i,
        `Customer ${i}`,
        `customer${i}@example.com`,
        `Company ${i}`,
      );
      sub.run(
        i,
        `SUB-${String(i).padStart(5, "0")}`,
        i,
        addDays(today(), -180),
        addDays(today(), 365),
        today(),
        lines,
      );
      for (let m = 0; m < 6; m++) {
        const cycle = addDays(today(), -(m + 1) * 30);
        const id = invoice.run(
          `BENCH-${i}-${m}`,
          i,
          i,
          JSON.stringify({
            name: `Customer ${i}`,
            email: `customer${i}@example.com`,
          }),
          cycle,
          cycle,
          addDays(cycle, 14),
          m === 0 ? "confirmed" : "paid",
          lines,
          m === 0 ? 0 : 153046,
        ).lastInsertRowid;
        if (m > 0) payment.run(id, addDays(cycle, 3), `receipt-${i}-${m}`);
      }
    }
  });
  server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const results = [];
  for (const [name, path] of [
    ["Subscriptions page", "/subscriptions?page=20&limit=20"],
    ["Filtered subscriptions", "/subscriptions?q=Company%209&limit=20"],
    ["Overdue invoices", "/invoices?status=overdue&page=10&limit=20"],
    ["Revenue dashboard", "/reports"],
  ]) {
    const times = [];
    for (let j = 0; j < 21; j++) {
      const start = performance.now();
      const response = await fetch(base + path, {
        headers: { Cookie: "brightloop_session=benchmark-session" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (j > 0) times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    results.push({
      operation: name,
      p50_ms: Number(times[10].toFixed(1)),
      p95_ms: Number(times[18].toFixed(1)),
      max_ms: Number(times[19].toFixed(1)),
    });
  }
  console.table(results);
  const start = performance.now();
  const billed = runBilling(db);
  const elapsed = performance.now() - start;
  console.log(
    `Transactional batch: ${billed.created} invoices in ${elapsed.toFixed(1)} ms; ${billed.remaining} subscriptions remain for subsequent bounded runs.`,
  );
  if (results.some((r) => r.p95_ms >= 2000))
    throw new Error("Page API p95 exceeded the 2-second budget");
  console.log(
    "PASS: all measured page APIs stayed below 2 seconds at p95. This is a local single-instance benchmark, not a concurrent production load test.",
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  for (const suffix of ["", "-wal", "-shm"])
    if (existsSync(file + suffix)) unlinkSync(file + suffix);
  rmdirSync(dir);
}
