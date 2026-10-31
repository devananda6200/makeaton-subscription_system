import { insert, audit, transaction } from "./db.mjs";
import {
  assert,
  hydrate,
  snapshotLines,
  subscriptionSchema,
  today,
  addDays,
  nextCycle,
  date,
  lineSchema,
} from "./domain.mjs";
import { z } from "zod";

export function createSubscription(db, input, user) {
  const data = subscriptionSchema.parse(input);
  const plan = db
    .prepare("SELECT * FROM plans WHERE id=? AND archived=0")
    .get(data.plan_id);
  assert(plan, "Plan is unavailable");
  assert(
    data.start_date >= plan.available_from &&
      (!plan.available_until || data.start_date <= plan.available_until),
    "Plan is not available on the selected start date",
  );
  assert(
    db.prepare("SELECT id FROM customers WHERE id=?").get(data.customer_id),
    "Customer not found",
  );
  assert(
    data.lines.reduce((n, l) => n + l.quantity, 0) >= plan.min_quantity,
    `This plan requires at least ${plan.min_quantity} units`,
  );
  const lines = snapshotLines(db, data.lines);
  const template = data.template_id
    ? db.prepare("SELECT * FROM templates WHERE id=?").get(data.template_id)
    : null;
  assert(
    !data.template_id || (template && template.plan_id === data.plan_id),
    "Template must match the selected plan",
  );
  return transaction(db, () => {
    const number = `SUB-${String(db.prepare("SELECT COALESCE(MAX(id),0)+1 n FROM subscriptions").get().n).padStart(5, "0")}`;
    const id = insert(db, "subscriptions", {
      number,
      customer_id: data.customer_id,
      plan_id: data.plan_id,
      status: "draft",
      start_date: data.start_date,
      expiry_date: data.expiry_date,
      next_billing: data.start_date,
      anchor_day: Number(data.start_date.slice(8)),
      payment_terms: data.payment_terms,
      plan_price: plan.price,
      billing_interval: plan.interval,
      lines: JSON.stringify(lines),
      quote_until: addDays(today(), template?.valid_days ?? 30),
    });
    audit(db, user, "Created subscription", "subscription", id, number);
    return hydrate(
      db.prepare("SELECT * FROM subscriptions WHERE id=?").get(id),
    );
  });
}

export function transitionSubscription(db, id, action, user, options = {}) {
  return transaction(db, () => {
    const sub = db
      .prepare(
        "SELECT s.*,p.auto_close,p.allow_pause,p.allow_close,p.allow_renew FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.id=?",
      )
      .get(id);
    assert(sub, "Subscription not found", 404);
    assert(
      user.role !== "customer" || sub.customer_id === user.customer_id,
      "Subscription not found",
      404,
    );
    if (user.role === "customer")
      assert(
        ["pause", "resume", "close", "renew"].includes(action),
        "This action requires a team member",
        403,
      );
    const stages = {
      quote: ["draft", "quotation"],
      confirm: ["quotation", "confirmed"],
      activate: ["confirmed", "active"],
      pause: ["active", "paused"],
      resume: ["paused", "active"],
    };
    let nextStatus;
    if (stages[action]) {
      const [from, to] = stages[action];
      assert(
        sub.status === from,
        `Only ${from} subscriptions can use this action`,
      );
      if (action === "confirm")
        assert(
          !sub.quote_until || sub.quote_until >= today(),
          "Quotation has expired; create a new quote",
        );
      if (action === "activate" || action === "resume")
        assert(sub.expiry_date > today(), "Renew the expired term first");
      if (action === "pause") {
        assert(sub.allow_pause, "This plan does not allow pausing");
        assert(
          sub.next_billing > today() || sub.next_billing >= sub.expiry_date,
          "Run outstanding billing before pausing this subscription",
        );
      }
      nextStatus = to;
    } else if (action === "close") {
      assert(sub.allow_close, "This plan does not allow early closure");
      assert(sub.status !== "closed", "Subscription is already closed");
      assert(
        !["active", "paused"].includes(sub.status) ||
          sub.next_billing > today() ||
          sub.next_billing >= sub.expiry_date,
        "Run outstanding billing before closing this subscription",
      );
      nextStatus = "closed";
    } else if (action === "renew") {
      assert(sub.allow_renew, "This plan does not allow renewal");
      assert(
        ["active", "paused", "closed"].includes(sub.status),
        "Only an activated subscription can be renewed",
      );
      const newExpiry = date.parse(options.expiry_date);
      assert(
        newExpiry > sub.expiry_date && newExpiry > today(),
        "New expiry must extend the existing term into the future",
      );
      db.prepare("UPDATE subscriptions SET expiry_date=? WHERE id=?").run(
        newExpiry,
        id,
      );
      if (sub.status === "closed") {
        // Restart closed service today; do not bill the cancelled gap.
        db.prepare(
          "UPDATE subscriptions SET next_billing=MAX(next_billing,?),anchor_day=? WHERE id=?",
        ).run(today(), Number(today().slice(8)), id);
      }
      nextStatus = sub.status === "closed" ? "active" : sub.status;
    } else assert(false, "Unknown subscription action");
    if (action === "resume") {
      // Skip elapsed paused cycles while preserving the original billing anchor.
      let next = sub.next_billing;
      while (next < today())
        next = nextCycle(next, sub.billing_interval, sub.anchor_day);
      db.prepare("UPDATE subscriptions SET next_billing=? WHERE id=?").run(
        next,
        id,
      );
    }
    db.prepare("UPDATE subscriptions SET status=? WHERE id=?").run(
      nextStatus,
      id,
    );
    audit(
      db,
      user,
      `${action[0].toUpperCase() + action.slice(1)} subscription`,
      "subscription",
      id,
      sub.number,
    );
    return hydrate(
      db.prepare("SELECT * FROM subscriptions WHERE id=?").get(id),
    );
  });
}

export function changeSubscriptionLines(db, id, input, user) {
  const requested = z.array(lineSchema).min(1).max(50).parse(input);
  return transaction(db, () => {
    const sub = db
      .prepare(
        "SELECT s.*,p.min_quantity FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.id=?",
      )
      .get(id);
    assert(sub, "Subscription not found", 404);
    assert(
      user.role !== "customer" || sub.customer_id === user.customer_id,
      "Subscription not found",
      404,
    );
    assert(
      sub.status !== "closed",
      "Renew this subscription before changing products",
    );
    assert(
      !["active", "paused"].includes(sub.status) || sub.next_billing > today(),
      "Run outstanding billing before changing future product lines",
    );
    const existing = JSON.parse(sub.lines);
    if (user.role === "customer") {
      assert(
        ["active", "paused"].includes(sub.status),
        "A team member must finish setting up this subscription first",
      );
      const isAddon = (line) =>
        db.prepare("SELECT type FROM products WHERE id=?").get(line.product_id)
          ?.type === "addon";
      const base = (lines) =>
        lines
          .filter((l) => !isAddon(l))
          .map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            variant: l.variant || "",
          }))
          .sort(
            (a, b) =>
              a.product_id - b.product_id || a.variant.localeCompare(b.variant),
          );
      assert(
        JSON.stringify(base(existing)) === JSON.stringify(base(requested)),
        "Customers can change add-ons only; contact your team to change base products",
        403,
      );
    }
    assert(
      requested.reduce((n, l) => n + l.quantity, 0) >= sub.min_quantity,
      `This plan requires at least ${sub.min_quantity} units`,
    );
    const lines = requested.map((line) => {
      const prior = existing.find(
        (l) => l.product_id === line.product_id && l.variant === line.variant,
      );
      return prior
        ? { ...prior, quantity: line.quantity }
        : snapshotLines(db, [line])[0];
    });
    db.prepare("UPDATE subscriptions SET lines=? WHERE id=?").run(
      JSON.stringify(lines),
      id,
    );
    audit(
      db,
      user,
      "Updated subscription products",
      "subscription",
      id,
      `${sub.number} · applies from ${sub.next_billing}`,
    );
    return hydrate(
      db.prepare("SELECT * FROM subscriptions WHERE id=?").get(id),
    );
  });
}
