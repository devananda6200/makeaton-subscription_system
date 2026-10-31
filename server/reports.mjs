import { today, addDays, date, assert } from "./domain.mjs";

export function report(db, user, query = {}) {
  const from = date.parse(query.from || addDays(today(), -179));
  const to = date.parse(query.to || today());
  assert(
    from <= to && Date.parse(to) - Date.parse(from) <= 732 * 86400000,
    "Select a date range of up to two years",
  );
  const planId = query.plan_id ? Number(query.plan_id) : null;
  assert(
    !planId || (Number.isSafeInteger(planId) && planId > 0),
    "Invalid plan filter",
  );
  const customerId = user.role === "customer" ? user.customer_id : null;
  const scope = `${customerId ? " AND s.customer_id=@customer" : ""}${planId ? " AND s.plan_id=@plan" : ""}`;
  const params = {
    from,
    to,
    today: today(),
    ...(customerId ? { customer: customerId } : {}),
    ...(planId ? { plan: planId } : {}),
  };
  const all = (sql) => {
    const stmt = db.prepare(sql);
    const names = new Set(
      [...sql.matchAll(/@(\w+)/g)].map((match) => match[1]),
    );
    return stmt.all(
      Object.fromEntries(
        Object.entries(params).filter(([key]) => names.has(key)),
      ),
    );
  };
  const one = (sql) => all(sql)[0];
  const active = one(
    `SELECT COUNT(*) count,COALESCE(SUM((s.plan_price+COALESCE((SELECT SUM(json_extract(j.value,'$.unit_price')*json_extract(j.value,'$.quantity')) FROM json_each(s.lines) j),0))*CASE s.billing_interval WHEN 'daily' THEN 365.0/12 WHEN 'weekly' THEN 52.0/12 WHEN 'yearly' THEN 1.0/12 ELSE 1 END),0) mrr FROM subscriptions s WHERE s.status='active' AND s.start_date<=@today AND s.expiry_date>@today ${scope}`,
  );
  const receivables = one(
    `SELECT COALESCE(SUM(i.total-i.paid),0) outstanding,COALESCE(SUM(CASE WHEN i.due_date<@today THEN i.total-i.paid ELSE 0 END),0) overdue,COUNT(CASE WHEN i.due_date<@today THEN 1 END) overdue_count FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id WHERE i.status='confirmed' ${scope}`,
  );
  const collected = one(
    `SELECT COALESCE(SUM(p.amount),0) total,COUNT(*) count FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN subscriptions s ON s.id=i.subscription_id WHERE p.paid_on BETWEEN @from AND @to ${scope}`,
  );
  const billed = one(
    `SELECT COALESCE(SUM(i.total),0) total FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id WHERE i.status IN ('confirmed','paid') AND i.issued_on BETWEEN @from AND @to ${scope}`,
  );
  const monthlyPayments = all(
    `SELECT substr(p.paid_on,1,7) month,SUM(p.amount) amount FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN subscriptions s ON s.id=i.subscription_id WHERE p.paid_on BETWEEN @from AND @to ${scope} GROUP BY month`,
  );
  const monthlyInvoices = all(
    `SELECT substr(i.issued_on,1,7) month,SUM(i.total) amount FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id WHERE i.status IN ('confirmed','paid') AND i.issued_on BETWEEN @from AND @to ${scope} GROUP BY month`,
  );
  const chart = [];
  let month = from.slice(0, 7);
  while (month <= to.slice(0, 7)) {
    chart.push({
      month,
      collected: monthlyPayments.find((r) => r.month === month)?.amount || 0,
      billed: monthlyInvoices.find((r) => r.month === month)?.amount || 0,
    });
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    month = d.toISOString().slice(0, 7);
  }
  const breakdown = all(
    `SELECT s.status,COUNT(*) count FROM subscriptions s WHERE 1=1 ${scope} GROUP BY s.status`,
  );
  const overdueInvoices = all(
    `SELECT i.id,i.number,i.total,i.paid,i.due_date,c.name customer_name,c.company FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN subscriptions s ON s.id=i.subscription_id WHERE i.status='confirmed' AND i.due_date<@today ${scope} ORDER BY i.due_date LIMIT 8`,
  );
  const renewals = all(
    `SELECT s.id,s.number,s.next_billing,s.expiry_date,c.name customer_name,p.name plan_name FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN plans p ON p.id=s.plan_id WHERE s.status='active' AND s.next_billing>=@today AND s.next_billing<date(@today,'+15 days') AND s.next_billing<s.expiry_date ${scope} ORDER BY s.next_billing LIMIT 6`,
  );
  const due = one(
    `SELECT COUNT(*) count FROM subscriptions s WHERE s.status='active' AND s.next_billing<=@today AND s.next_billing<s.expiry_date ${scope}`,
  );
  const plans = all(
    `SELECT p.name,COUNT(*) count FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status='active' ${scope} GROUP BY p.id ORDER BY count DESC`,
  );
  return {
    from,
    to,
    active: active.count,
    mrr: Math.round(active.mrr),
    arr: Math.round(active.mrr * 12),
    ...receivables,
    collected: collected.total,
    payment_count: collected.count,
    billed: billed.total,
    chart,
    breakdown,
    overdueInvoices,
    renewals,
    due: due.count,
    plans,
  };
}

export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
