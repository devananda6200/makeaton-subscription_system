import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, insert } from "../db.mjs";
import { nextCycle, password, date, today, addDays } from "../domain.mjs";
import {
  createSubscription,
  transitionSubscription,
  changeSubscriptionLines,
} from "../subscriptions.mjs";
import { hashPassword, checkPassword } from "../auth.mjs";

export function fixture() {
  const db = openDatabase(":memory:");
  insert(db, "customers", { name: "Customer", email: "customer@example.com" });
  insert(db, "taxes", { name: "GST", rate_bps: 1800 });
  insert(db, "products", {
    name: "Seat",
    type: "software",
    price: 10000,
    cost: 1000,
    variants: JSON.stringify([{ name: "Odoo", extra: 56000 }]),
    tax_id: 1,
  });
  insert(db, "plans", {
    name: "Monthly",
    price: 10000,
    interval: "monthly",
    available_from: "2020-01-01",
    min_quantity: 1,
    tax_id: 1,
  });
  const user = { id: null, name: "Test admin", role: "admin" };
  const input = {
    customer_id: 1,
    plan_id: 1,
    start_date: today(),
    expiry_date: addDays(today(), 90),
    payment_terms: 14,
    lines: [{ product_id: 1, quantity: 2, variant: "" }],
  };
  return { db, user, input };
}

test("calendar cycles retain the original anchor across February and leap years", () => {
  assert.equal(nextCycle("2025-01-31", "monthly", 31), "2025-02-28");
  assert.equal(nextCycle("2025-02-28", "monthly", 31), "2025-03-31");
  assert.equal(nextCycle("2024-02-29", "yearly", 29), "2025-02-28");
  assert.equal(nextCycle("2026-12-30", "weekly"), "2027-01-06");
  assert.equal(nextCycle("2026-12-31", "daily"), "2027-01-01");
  assert.throws(() => date.parse("2026-02-30"));
});
test("password policy and salted password verification", async () => {
  for (const p of [
    "Short!Aa",
    "alllowercase!",
    "ALLUPPERCASE!",
    "NoSpecial123",
  ])
    assert.throws(() => password.parse(p));
  const hash = await hashPassword("StrongPass!");
  assert.equal(await checkPassword("StrongPass!", hash), true);
  assert.equal(await checkPassword("WrongPass!", hash), false);
  assert.notEqual(hash, await hashPassword("StrongPass!"));
});
test("subscription state machine rejects skipped stages and enforces plan flags", () => {
  const { db, user, input } = fixture();
  const sub = createSubscription(db, input, user);
  assert.throws(
    () => transitionSubscription(db, sub.id, "activate", user),
    /confirmed/,
  );
  transitionSubscription(db, sub.id, "quote", user);
  transitionSubscription(db, sub.id, "confirm", user);
  transitionSubscription(db, sub.id, "activate", user);
  db.prepare("UPDATE plans SET allow_pause=0 WHERE id=1").run();
  assert.throws(
    () => transitionSubscription(db, sub.id, "pause", user),
    /does not allow/,
  );
  assert.throws(
    () =>
      transitionSubscription(db, sub.id, "close", {
        ...user,
        role: "customer",
        customer_id: 2,
      }),
    /not found/,
  );
  db.close();
});
test("catalog snapshots honor variant surcharges, availability and minimum quantities", () => {
  const { db, user, input } = fixture();
  const sub = createSubscription(
    db,
    { ...input, lines: [{ product_id: 1, quantity: 2, variant: "Odoo" }] },
    user,
  );
  assert.equal(sub.lines[0].unit_price, 66000);
  db.prepare("UPDATE products SET price=1 WHERE id=1").run();
  assert.equal(
    JSON.parse(
      db.prepare("SELECT lines FROM subscriptions WHERE id=?").get(sub.id)
        .lines,
    )[0].unit_price,
    66000,
  );
  db.prepare("UPDATE plans SET min_quantity=5 WHERE id=1").run();
  assert.throws(() => createSubscription(db, input, user), /at least 5/);
  db.close();
});

test("customers can change future add-ons but cannot change base products or other accounts", () => {
  const { db, user, input } = fixture();
  insert(db, "products", {
    name: "Analytics",
    type: "addon",
    price: 5000,
    cost: 1000,
    tax_id: 1,
  });
  const sub = createSubscription(db, input, user);
  db.prepare(
    "UPDATE subscriptions SET status='active',next_billing=? WHERE id=?",
  ).run(addDays(today(), 20), sub.id);
  const customer = { ...user, role: "customer", customer_id: 1 };
  const lines = [...input.lines, { product_id: 2, quantity: 1, variant: "" }];
  const changed = changeSubscriptionLines(db, sub.id, lines, customer);
  assert.equal(changed.lines[1].unit_price, 5000);
  assert.throws(
    () =>
      changeSubscriptionLines(
        db,
        sub.id,
        [{ ...input.lines[0], quantity: 3 }],
        customer,
      ),
    /add-ons only/,
  );
  assert.throws(
    () =>
      changeSubscriptionLines(db, sub.id, lines, {
        ...customer,
        customer_id: 2,
      }),
    /not found/,
  );
  db.prepare("UPDATE products SET price=99999 WHERE id=1").run();
  assert.equal(
    changeSubscriptionLines(db, sub.id, input.lines, customer).lines[0]
      .unit_price,
    10000,
  );
  db.prepare("UPDATE subscriptions SET next_billing=? WHERE id=?").run(
    today(),
    sub.id,
  );
  assert.throws(
    () => changeSubscriptionLines(db, sub.id, lines, customer),
    /outstanding billing/,
  );
  db.close();
});
