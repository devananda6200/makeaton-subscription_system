import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../db.mjs";
import { initializeData } from "../seed.mjs";
import { report } from "../reports.mjs";

test("compact demo reports include active subscriptions and collected payments", async () => {
  const db = openDatabase(":memory:");
  try {
    await initializeData(db, true);
    const result = report(db, { role: "admin" });
    assert.ok(result.mrr > 0, "Active subscriptions must contribute MRR");
    const payments = db
      .prepare("SELECT SUM(amount) total FROM payments")
      .get().total;
    assert.ok(payments > 0);
    assert.equal(result.active, 3);
    assert.equal(result.collected, payments);
    assert.equal(result.payment_count, 2);
  } finally {
    db.close();
  }
});
