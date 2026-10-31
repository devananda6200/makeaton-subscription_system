import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { openDatabase } from "../db.mjs";
import { initializeData } from "../seed.mjs";
import { createApp } from "../app.mjs";
import { today, addDays } from "../domain.mjs";

test("complete HTTP workflow from catalog and template through invoice, receipt, and portal", async (t) => {
  const db = openDatabase(":memory:");
  await initializeData(db, true);
  const server = createApp(db, { demo: true }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.close();
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie;
  async function call(path, method = "GET", body) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    assert.ok(response.ok, `${path}: ${JSON.stringify(result)}`);
    cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
    return result;
  }
  await call("/auth/login", "POST", {
    email: "admin@brightloop.demo",
    password: "LoopDemo!2026",
  });
  const tax = await call("/taxes", "POST", {
    name: "Test tax 5%",
    rate_bps: 500,
  });
  const product = await call("/products", "POST", {
    name: "Test product",
    type: "software",
    price: 10000,
    cost: 1000,
    tax_id: tax.id,
    variants: [{ name: "Odoo", extra: 56000 }],
  });
  const plan = await call("/plans", "POST", {
    name: "Test daily plan",
    price: 1000,
    interval: "daily",
    min_quantity: 1,
    available_from: today(),
    tax_id: tax.id,
  });
  const lines = [{ product_id: product.id, quantity: 2, variant: "Odoo" }];
  const template = await call("/templates", "POST", {
    name: "Test offer",
    plan_id: plan.id,
    valid_days: 7,
    lines,
  });
  const sub = await call("/subscriptions", "POST", {
    customer_id: 1,
    plan_id: plan.id,
    template_id: template.id,
    start_date: today(),
    expiry_date: addDays(today(), 30),
    payment_terms: 14,
    lines,
  });
  assert.equal(sub.quote_until, addDays(today(), 7));
  const discount = await call("/discounts", "POST", {
    name: "Test fixed discount",
    kind: "fixed",
    value: 1000,
    starts_on: today(),
    ends_on: addDays(today(), 30),
    usage_limit: 1,
    subscription_id: sub.id,
  });
  for (const action of ["quote", "confirm", "activate"])
    await call(`/subscriptions/${sub.id}/action`, "POST", { action });
  await call("/billing/run", "POST", {});
  assert.equal((await call("/billing/run", "POST", {})).created, 0);
  const details = await call(`/subscriptions/${sub.id}`);
  const invoice = await call(`/invoices/${details.invoices[0].id}`);
  assert.equal(invoice.subtotal, 133000);
  assert.equal(invoice.discount, 1000); // Existing product-specific rules must not affect this new product.
  assert.equal(invoice.tax, 6600);
  assert.equal(invoice.total, 138600);
  assert.equal((await call("/discounts?q=Test%20fixed")).items[0].uses, 1);
  await call(`/invoices/${invoice.id}/action`, "POST", { action: "confirm" });
  await call(`/invoices/${invoice.id}/payments`, "POST", {
    amount: 10000,
    method: "upi",
    paid_on: today(),
    note: "partial",
    idempotency_key: "workflow-partial",
  });
  await call(`/invoices/${invoice.id}/payments`, "POST", {
    amount: invoice.total - 10000,
    method: "bank_transfer",
    paid_on: today(),
    note: "settlement",
    idempotency_key: "workflow-settle",
  });
  assert.equal((await call(`/invoices/${invoice.id}`)).status, "paid");
  await call(`/invoices/${invoice.id}/action`, "POST", { action: "send" });
  assert.ok((await call("/outbox")).items[0].body.includes(invoice.number));
  await call(`/subscriptions/${sub.id}/action`, "POST", { action: "pause" });
  await call(`/subscriptions/${sub.id}/action`, "POST", { action: "resume" });
  await call(`/subscriptions/${sub.id}/action`, "POST", {
    action: "renew",
    expiry_date: addDays(today(), 90),
  });
  const print = await fetch(base + `/invoices/${invoice.id}/print`, {
    headers: { Cookie: cookie },
  });
  assert.equal(print.status, 200);
  assert.ok((await print.text()).includes(invoice.number));
  await call("/auth/logout", "POST", {});
  await call("/auth/login", "POST", {
    email: "customer@brightloop.demo",
    password: "LoopDemo!2026",
  });
  assert.equal((await call(`/invoices/${invoice.id}`)).paid, invoice.total);
  const addon = (await call("/subscription-catalog")).items.find(
    (p) => p.type === "addon",
  );
  await call(`/subscriptions/${sub.id}/lines`, "PUT", {
    lines: [...lines, { product_id: addon.id, quantity: 1, variant: "" }],
  });
  assert.equal((await call(`/subscriptions/${sub.id}`)).lines.length, 2);
  assert.equal(
    db.prepare("SELECT uses FROM discounts WHERE id=?").get(discount.id).uses,
    1,
  );
});
