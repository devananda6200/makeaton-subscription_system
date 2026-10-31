import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, insert } from "../db.mjs";
import { today, addDays } from "../domain.mjs";
import { createSubscription } from "../subscriptions.mjs";
import {
  runBilling,
  calculateInvoice,
  recordPayment,
  invoiceAction,
} from "../billing.mjs";

function fixture(interval = "monthly") {
  const db = openDatabase(":memory:");
  const user = { id: null, name: "Tester", role: "admin" };
  insert(db, "customers", { name: "A", email: "a@example.com" });
  insert(db, "taxes", { name: "GST 18%", rate_bps: 1800 });
  insert(db, "products", {
    name: "Seat",
    type: "software",
    price: 10000,
    cost: 2000,
    tax_id: 1,
  });
  insert(db, "plans", {
    name: "Growth",
    price: 10000,
    interval,
    min_quantity: 1,
    available_from: "2020-01-01",
    tax_id: 1,
  });
  const sub = createSubscription(
    db,
    {
      customer_id: 1,
      plan_id: 1,
      start_date: today(),
      expiry_date: addDays(today(), 90),
      payment_terms: 14,
      lines: [{ product_id: 1, quantity: 2, variant: "" }],
    },
    user,
  );
  db.prepare("UPDATE subscriptions SET status='active' WHERE id=?").run(sub.id);
  return {
    db,
    user,
    sub: db.prepare("SELECT * FROM subscriptions WHERE id=?").get(sub.id),
  };
}
test("billing is idempotent and snapshots invoice amounts", () => {
  const { db, user } = fixture();
  assert.equal(runBilling(db, user).created, 1);
  assert.equal(runBilling(db, user).created, 0);
  const invoice = db.prepare("SELECT * FROM invoices").get();
  assert.deepEqual(
    [invoice.subtotal, invoice.discount, invoice.tax, invoice.total],
    [30000, 0, 5400, 35400],
  );
  db.prepare("UPDATE taxes SET rate_bps=500 WHERE id=1").run();
  assert.equal(db.prepare("SELECT tax FROM invoices").get().tax, 5400);
  db.close();
});
test("discounts respect scope, minimums, date windows and usage limits", () => {
  const { db, user, sub } = fixture();
  const base = {
    kind: "percentage",
    value: 1000,
    min_purchase: 20000,
    min_quantity: 2,
    starts_on: today(),
    ends_on: addDays(today(), 10),
    usage_limit: 1,
    product_id: 1,
  };
  insert(db, "discounts", { ...base, name: "Seat discount" });
  insert(db, "discounts", {
    ...base,
    name: "Expired",
    ends_on: addDays(today(), -1),
  });
  insert(db, "discounts", { ...base, name: "Too small", min_purchase: 100000 });
  insert(db, "discounts", {
    ...base,
    name: "Not enough seats",
    min_quantity: 5,
  });
  const preview = calculateInvoice(db, sub, today());
  assert.equal(preview.discount, 2000);
  assert.equal(preview.tax, 5040);
  assert.equal(
    db.prepare("SELECT uses FROM discounts WHERE id=1").get().uses,
    0,
  );
  runBilling(db, user);
  assert.equal(
    db.prepare("SELECT uses FROM discounts WHERE id=1").get().uses,
    1,
  );
  assert.equal(calculateInvoice(db, sub, today()).discount, 0);
  invoiceAction(db, 1, "cancel", user);
  assert.equal(
    db.prepare("SELECT uses FROM discounts WHERE id=1").get().uses,
    0,
  );
  assert.equal(runBilling(db, user).created, 0);
  db.close();
});
test("fixed discounts allocate precisely and cannot create negative balances", () => {
  const { db, sub } = fixture();
  insert(db, "discounts", {
    name: "Credit",
    kind: "fixed",
    value: 10001,
    starts_on: today(),
    ends_on: today(),
    usage_limit: 2,
  });
  let result = calculateInvoice(db, sub, today());
  assert.equal(
    result.lines.reduce((n, l) => n + l.discount, 0),
    10001,
  );
  assert.equal(result.total, result.subtotal - result.discount + result.tax);
  insert(db, "discounts", {
    name: "Full cover",
    kind: "fixed",
    value: 999999,
    starts_on: today(),
    ends_on: today(),
    usage_limit: 2,
  });
  result = calculateInvoice(db, sub, today());
  assert.equal(result.total, 0);
  assert.equal(result.tax, 0);
  db.close();
});
test("partial receipts, exact settlement and duplicate protection are atomic", () => {
  const { db, user } = fixture();
  runBilling(db, user);
  const payment = {
    amount: 10000,
    method: "upi",
    paid_on: today(),
    note: "Receipt",
    idempotency_key: "receipt-first",
  };
  assert.throws(() => recordPayment(db, 1, payment, user), /confirmed/);
  invoiceAction(db, 1, "confirm", user);
  recordPayment(db, 1, payment, user);
  recordPayment(db, 1, payment, user);
  assert.equal(
    db.prepare("SELECT paid FROM invoices WHERE id=1").get().paid,
    10000,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM payments").get().n, 1);
  assert.throws(
    () => recordPayment(db, 1, { ...payment, amount: 20000 }, user),
    /different receipt/,
  );
  assert.throws(
    () =>
      recordPayment(
        db,
        1,
        { ...payment, amount: 999999, idempotency_key: "receipt-too-large" },
        user,
      ),
    /exceeds/,
  );
  assert.throws(() => invoiceAction(db, 1, "cancel", user), /unpaid/);
  recordPayment(
    db,
    1,
    { ...payment, amount: 25400, idempotency_key: "receipt-final" },
    user,
  );
  assert.equal(
    db.prepare("SELECT status FROM invoices WHERE id=1").get().status,
    "paid",
  );
  assert.throws(
    () =>
      recordPayment(
        db,
        1,
        { ...payment, idempotency_key: "receipt-extra" },
        user,
      ),
    /confirmed/,
  );
  db.close();
});
test("catch-up billing closes an expired daily term without skipping its final cycles", () => {
  const { db, user, sub } = fixture("daily");
  db.prepare(
    "UPDATE subscriptions SET start_date=?,next_billing=?,expiry_date=? WHERE id=?",
  ).run(
    addDays(today(), -5),
    addDays(today(), -5),
    addDays(today(), -1),
    sub.id,
  );
  const result = runBilling(db, user);
  assert.equal(result.created, 4);
  assert.equal(result.closed, 1);
  assert.equal(runBilling(db, user).created, 0);
  assert.equal(
    db.prepare("SELECT status FROM subscriptions").get().status,
    "closed",
  );
  db.close();
});
test("an invoice failure rolls back discount usage and the billing cursor", () => {
  const { db, user, sub } = fixture();
  insert(db, "discounts", {
    name: "Credit",
    kind: "fixed",
    value: 500,
    starts_on: today(),
    ends_on: today(),
    usage_limit: 1,
  });
  db.exec(
    "CREATE TRIGGER force_failure BEFORE INSERT ON invoices BEGIN SELECT RAISE(ABORT,'simulated failure'); END",
  );
  assert.throws(() => runBilling(db, user), /simulated/);
  assert.equal(db.prepare("SELECT uses FROM discounts").get().uses, 0);
  assert.equal(
    db.prepare("SELECT next_billing FROM subscriptions").get().next_billing,
    sub.next_billing,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM invoices").get().n, 0);
  db.close();
});
