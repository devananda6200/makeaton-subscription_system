import { z } from 'zod';
import { transaction, insert, audit } from './db.mjs';
import { assert, today, nextCycle, addDays, hydrate, date, money, escapeHtml } from './domain.mjs';
import { queueEmail } from './mail.mjs';

const roundRatio = (amount, numerator, denominator) => Number((BigInt(amount)*BigInt(numerator)+BigInt(denominator)/2n)/BigInt(denominator));
const floorRatio = (amount, numerator, denominator) => Number(BigInt(amount)*BigInt(numerator)/BigInt(denominator));

export function calculateInvoice(db, sub, cycleDate, consume = false) {
  const plan = db.prepare('SELECT name,tax_id FROM plans WHERE id=?').get(sub.plan_id);
  const source = [{ product_id: null, name: `${plan.name} · base fee`, variant: '', quantity: 1, unit_price: sub.plan_price, tax_id: plan.tax_id }, ...JSON.parse(sub.lines)];
  const lines = source.map(line => ({ ...line, subtotal: line.quantity * line.unit_price, discount: 0, tax_bps: line.tax_id ? (db.prepare('SELECT rate_bps FROM taxes WHERE id=?').get(line.tax_id)?.rate_bps || 0) : 0 }));
  const subtotal = lines.reduce((n, l) => n + l.subtotal, 0);
  const quantity = source.slice(1).reduce((n, l) => n + l.quantity, 0);
  const applied = [];
  // Stable rule ordering makes stacking deterministic. Fixed discounts allocate in
  // paise across eligible lines; tax is calculated after line-level discounts.
  for (const discount of db.prepare('SELECT * FROM discounts WHERE enabled=1 AND starts_on<=? AND ends_on>=? AND uses<usage_limit AND (subscription_id IS NULL OR subscription_id=?) ORDER BY id').all(cycleDate, cycleDate, sub.id)) {
    if (subtotal < discount.min_purchase || quantity < discount.min_quantity) continue;
    const eligible = lines.filter(l => !discount.product_id || l.product_id === discount.product_id);
    const basis = eligible.reduce((n, l) => n + l.subtotal - l.discount, 0);
    if (!basis) continue;
    const amount = discount.kind === 'fixed' ? Math.min(basis, discount.value) : roundRatio(basis, discount.value, 10000);
    if (!amount) continue;
    let remainder = amount;
    eligible.forEach((line, index) => {
      const part = index === eligible.length - 1 ? remainder : floorRatio(amount, line.subtotal - line.discount, basis);
      line.discount += part;
      remainder -= part;
    });
    applied.push({ id: discount.id, name: discount.name, amount });
    if (consume) db.prepare('UPDATE discounts SET uses=uses+1 WHERE id=?').run(discount.id);
  }
  for (const line of lines) {
    line.tax = roundRatio(line.subtotal - line.discount, line.tax_bps, 10000);
    line.total = line.subtotal - line.discount + line.tax;
  }
  return { lines, subtotal, discount: lines.reduce((n,l) => n+l.discount, 0), tax: lines.reduce((n,l) => n+l.tax, 0), total: lines.reduce((n,l) => n+l.total, 0), discount_ids: applied };
}

export function runBilling(db, user = null, asOf = today()) {
  date.parse(asOf);
  assert(asOf <= today(), 'Billing cannot run into the future');
  return transaction(db, () => {
    const due = db.prepare("SELECT * FROM subscriptions WHERE status='active' AND next_billing<=? AND next_billing<expiry_date ORDER BY next_billing,id LIMIT 1000").all(asOf);
    let created = 0;
    let total = 0;
    for (const sub of due) {
      let cycle = sub.next_billing;
      while (cycle <= asOf && cycle < sub.expiry_date && created < 2000) {
        const existing = db.prepare('SELECT id FROM invoices WHERE subscription_id=? AND cycle_date=?').get(sub.id, cycle);
        if (!existing) {
          const amounts = calculateInvoice(db, sub, cycle, true);
          const number = `INV-${String(db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM invoices').get().n).padStart(5,'0')}`;
          const customer = db.prepare('SELECT name,email,company,address FROM customers WHERE id=?').get(sub.customer_id);
          const invoiceId = insert(db, 'invoices', {
            number, subscription_id: sub.id, customer_id: sub.customer_id, customer_snapshot: JSON.stringify(customer),
            cycle_date: cycle, issued_on: asOf, due_date: addDays(cycle, sub.payment_terms), status: 'draft',
            ...amounts, lines: JSON.stringify(amounts.lines), discount_ids: JSON.stringify(amounts.discount_ids),
          });
          audit(db, user, 'Generated invoice', 'invoice', invoiceId, `${number} · ${money(amounts.total)}`);
          created++; total += amounts.total;
        }
        cycle = nextCycle(cycle, sub.billing_interval, sub.anchor_day);
      }
      db.prepare('UPDATE subscriptions SET next_billing=? WHERE id=?').run(cycle, sub.id);
      if (created >= 2000) break;
    }
    const expired = db.prepare("SELECT s.id,s.number FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status IN ('active','paused') AND p.auto_close=1 AND s.expiry_date<=? AND (s.next_billing>=s.expiry_date OR s.status='paused')").all(asOf);
    for (const sub of expired) {
      db.prepare("UPDATE subscriptions SET status='closed' WHERE id=?").run(sub.id);
      audit(db, user, 'Closed expired subscription', 'subscription', sub.id, sub.number);
    }
    const remaining = db.prepare("SELECT COUNT(*) n FROM subscriptions WHERE status='active' AND next_billing<=? AND next_billing<expiry_date").get(asOf).n;
    audit(db, user, 'Completed billing run', 'billing', null, `${created} invoices · ${money(total)} · ${expired.length} closed`);
    return { created, total, closed: expired.length, remaining };
  });
}

const paymentSchema = z.object({ amount: z.number().int().positive().max(1_000_000_000_000), method: z.enum(['bank_transfer','card','upi','cash','other']), paid_on: date, note: z.string().max(500).default(''), idempotency_key: z.string().min(8).max(100) });
export function recordPayment(db, invoiceId, input, user) {
  const data = paymentSchema.parse(input);
  assert(data.paid_on <= today(), 'Payment date cannot be in the future');
  return transaction(db, () => {
    const prior = db.prepare('SELECT * FROM payments WHERE idempotency_key=?').get(data.idempotency_key);
    if (prior) {
      assert(prior.invoice_id === invoiceId && prior.amount === data.amount && prior.method === data.method && prior.paid_on === data.paid_on && prior.note === data.note, 'This payment reference was already used for a different receipt', 409);
      return prior;
    }
    const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(invoiceId);
    assert(invoice, 'Invoice not found', 404);
    assert(invoice.status === 'confirmed', 'Only confirmed outstanding invoices accept payments');
    assert(data.paid_on >= invoice.issued_on, 'Payment date cannot precede invoice issue date');
    assert(data.amount <= invoice.total - invoice.paid, 'Payment exceeds the outstanding balance');
    const id = insert(db, 'payments', { invoice_id: invoiceId, ...data });
    const paid = invoice.paid + data.amount;
    db.prepare('UPDATE invoices SET paid=?,status=? WHERE id=?').run(paid, paid === invoice.total ? 'paid' : 'confirmed', invoiceId);
    audit(db, user, 'Recorded payment', 'invoice', invoiceId, `${invoice.number} · ${money(data.amount)} via ${data.method.replace('_',' ')}`);
    return db.prepare('SELECT * FROM payments WHERE id=?').get(id);
  });
}

export function invoiceAction(db, invoiceId, action, user) {
  return transaction(db, () => {
    const invoice = hydrate(db.prepare('SELECT * FROM invoices WHERE id=?').get(invoiceId));
    assert(invoice, 'Invoice not found', 404);
    if (action === 'confirm') {
      assert(invoice.status === 'draft', 'Only draft invoices can be confirmed');
      db.prepare('UPDATE invoices SET status=? WHERE id=?').run(invoice.total === 0 ? 'paid' : 'confirmed', invoiceId);
    } else if (action === 'cancel') {
      assert(['draft','confirmed'].includes(invoice.status) && invoice.paid === 0, 'Only unpaid draft or confirmed invoices can be cancelled');
      db.prepare("UPDATE invoices SET status='cancelled' WHERE id=?").run(invoiceId);
      for (const discount of invoice.discount_ids) db.prepare('UPDATE discounts SET uses=MAX(0,uses-1) WHERE id=?').run(discount.id);
      // The unique cycle remains reserved. Cancellation intentionally waives that cycle.
    } else if (action === 'send' || action === 'remind') {
      assert(['confirmed','paid'].includes(invoice.status), 'Confirm the invoice before sending');
      if (action === 'remind') assert(invoice.total > invoice.paid, 'There is no outstanding balance');
      const customer = invoice.customer_snapshot;
      const body = `Hi ${customer.name},\n\n${action === 'remind' ? 'A friendly reminder for' : 'Here is'} your Brightloop invoice ${invoice.number}.\nTotal: ${money(invoice.total)}\nPaid: ${money(invoice.paid)}\nBalance: ${money(invoice.total-invoice.paid)}\nDue: ${invoice.due_date}\n\n${invoice.lines.map(l => `${l.name}${l.variant ? ' / ' + l.variant : ''} x ${l.quantity}: ${money(l.total)}`).join('\n')}\n\nView your invoices in your customer portal: ${process.env.APP_URL || 'http://localhost:5173'}/#/invoices\n\nThank you,\nThe Brightloop team`;
      queueEmail(db, customer.email, `${action === 'remind' ? 'Payment reminder: ' : ''}${invoice.number} from Brightloop`, body);
      db.prepare("UPDATE invoices SET sent_at=datetime('now') WHERE id=?").run(invoiceId);
    } else assert(false, 'Unknown invoice action');
    audit(db, user, `${action[0].toUpperCase()+action.slice(1)} invoice`, 'invoice', invoiceId, invoice.number);
    return hydrate(db.prepare('SELECT * FROM invoices WHERE id=?').get(invoiceId));
  });
}

export function printableInvoice(invoice) {
  const e = escapeHtml;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(invoice.number)} · Brightloop</title><style>body{font:15px system-ui;color:#242238;max-width:850px;margin:60px auto;padding:24px}h1{color:#7258f5}header{display:flex;justify-content:space-between}small{color:#676579}table{width:100%;border-collapse:collapse;margin:40px 0}td,th{padding:14px 8px;border-bottom:1px solid #eae8ef;text-align:right}td:first-child,th:first-child{text-align:left}.totals{margin-left:auto;width:300px}.totals p{display:flex;justify-content:space-between}.grand{font-size:22px;font-weight:700}button{background:#7258f5;color:white;border:0;padding:12px 20px;border-radius:8px;cursor:pointer}@media print{button{display:none}body{margin:0}}</style></head><body><header><div><h1>brightloop.</h1><small>Subscription billing, beautifully connected.</small></div><div><h2>${e(invoice.number)}</h2><p>${e(invoice.status.toUpperCase())}</p></div></header><hr><h3>Bill to ${e(invoice.customer_snapshot.company || invoice.customer_snapshot.name)}</h3><p>${e(invoice.customer_snapshot.name)}<br>${e(invoice.customer_snapshot.email)}<br>${e(invoice.customer_snapshot.address)}</p><p>Issued ${e(invoice.issued_on)} · Due ${e(invoice.due_date)} · Billing cycle ${e(invoice.cycle_date)}</p><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>${invoice.lines.map(l=>`<tr><td>${e(l.name)} ${e(l.variant)}</td><td>${l.quantity}</td><td>${money(l.unit_price)}</td><td>${money(l.discount)}</td><td>${money(l.tax)}</td><td>${money(l.total)}</td></tr>`).join('')}</tbody></table><div class="totals"><p>Subtotal <span>${money(invoice.subtotal)}</span></p><p>Discount <span>−${money(invoice.discount)}</span></p><p>Tax <span>${money(invoice.tax)}</span></p><p class="grand">Total <span>${money(invoice.total)}</span></p><p>Paid <span>${money(invoice.paid)}</span></p><p>Balance <b>${money(invoice.total-invoice.paid)}</b></p></div><p>Currency: INR. Thank you for growing with Brightloop.</p><button onclick="window.print()">Print / save PDF</button></body></html>`;
}
