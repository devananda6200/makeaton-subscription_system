# Brightloop: problem statement coverage

Source: the supplied four-page Subscription Management System brief.

## Product decisions

- Three roles: admin, staff, customer. Authorization lives on the server.
- INR is the single ledger currency; prices are stored as integer paise.
- React + TypeScript frontend, Express API, Node 24 SQLite persistent store.
- SQLite WAL, indexes, bounded pages, and atomic transactions support a single application instance. PostgreSQL plus a queue is the documented multi-instance growth path.
- Built-in demo records are explicitly fictional. Demo email is inspectable in an outbox; SMTP sends real mail when configured. Payments record receipts; they do not charge cards.

## Acceptance checklist

1. Unique case-insensitive email; passwords longer than eight characters with upper, lower, special characters; expiring single-use email reset; admin-only staff creation.
2. Products with type, sales/cost price, notes, variants and surcharges (including Odoo + INR 560).
3. Daily/weekly/monthly/yearly plans with price, minimum quantity, availability and close/pause/renew controls.
4. Reusable quotation templates with plan, product lines and validity period.
5. Numbered subscriptions with customer, dates, payment terms, itemized products, quantities, prices, tax, and explicit Draft → Quotation → Confirmed → Active → Closed lifecycle. Paused state is an extension.
6. Recurring billing with transactional invoice creation, calendar-aware cycles, and a unique subscription/cycle constraint. Draft → Confirmed → Paid invoices; cancel, email and print.
7. Admin-only fixed/percentage discounts with date, minimum purchase/quantity, usage cap, product/subscription scope; automatic next-invoice application.
8. Partial and full receipt recording with method/date/note, overpayment protection, outstanding and overdue balances.
9. Filtered reports for active subscriptions, normalized MRR, cash receipts, outstanding invoices; CSV export and actionable overdue list.
10. Customer portal is scoped to the logged-in customer, including authorized subscription actions and their invoices.
11. Thousands-of-record performance benchmark and integration tests for financial/security invariants.

## Checkpoints

1. Project foundation and documented architecture.
2. Persistent domain, secure accounts, catalog and lifecycle API.
3. Recurring billing, discounts, payments, reports and correctness tests.
4. Responsive operations workspace and self-service portal.
5. Browser verification, deployment packaging, demo guide and final fixes.

Every completed checkpoint is committed and pushed to the configured origin.
