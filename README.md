# Brightloop

**One workspace. Every subscription.**

Brightloop turns the Subscription Management System challenge into a complete workflow: **catalog → quotation → subscription → invoice → payment → revenue insight**. Built for a clear hackathon demonstration, with persistent records and tested financial logic underneath the interface.

## Start in two commands

Requires **Node.js 24+**. No database service, API key, or paid account is needed.

```sh
npm ci
npm run dev
```

Open **[localhost:5173](http://localhost:5173)**. Choose **Workspace admin**, **Team member**, or **Customer portal**. The first launch creates a fictional, persistent demo workspace in `data/brightloop.db`.

| Demo account | Email                      | Password        |
| ------------ | -------------------------- | --------------- |
| Admin        | `admin@brightloop.demo`    | `LoopDemo!2026` |
| Staff        | `staff@brightloop.demo`    | `LoopDemo!2026` |
| Customer     | `customer@brightloop.demo` | `LoopDemo!2026` |

These credentials are only for the fictional demo. Production uses a fresh database, `DEMO_MODE=false`, and an administrator supplied through environment variables.

## What works

- **Accounts:** unique emails, strong passwords, hashed expiring sessions, single-use email resets, admin-only staff creation, and portal invitations.
- **Catalog:** products, sales/cost prices, notes, variants/surcharges, tax rules, and archiving.
- **Plans:** daily/weekly/monthly/yearly billing, minimum quantities, availability dates, and pause/closure/auto-close/renewal policies.
- **Quotation templates:** reusable plan/product bundles, quotation validity, and numbered subscriptions with an enforced lifecycle.
- **Recurring billing:** manual runs and hourly scheduling, month-end-safe dates, catch-up billing, invoice snapshots, automatic taxes/discounts, and duplicate-cycle protection.
- **Invoices:** draft, confirmation, settlement, cancellation, email, reminders, print, and browser Save as PDF.
- **Discounts:** fixed/percentage, date and usage limits, purchase/quantity minimums, product/subscription scope, and exact paise allocation.
- **Payments:** partial/full receipts with method/date/reference, duplicate-request protection, and overpayment rejection.
- **Reporting:** MRR/ARR, active subscriptions, cash collected, outstanding/overdue balances, date/plan filters, CSV export, and upcoming cycles.
- **Self-service:** customer-owned records only, eligible pause/resume/renew/close actions, and add-ons effective from the next billing cycle.
- **Operations:** audit trail, delivery outbox, accessible dialogs, search, pagination, responsive layouts, and demo role switching.

## Verify

```sh
npm test                 # 14 financial, security, and HTTP workflow tests
npm run test:workflow    # Complete catalog-to-portal HTTP journey
npm run build           # TypeScript check and optimized frontend
npm run benchmark       # Isolated 10k-subscription / 60k-invoice fixture
```

The core journey was also exercised in the connected browser. See [verification details](docs/VERIFICATION.md).

## Present and deploy

Follow the [five-minute judging demo](docs/DEMO.md). It includes the story, interaction sequence, and architecture answers.

```sh
npm run build
npm start
```

The built app opens on [localhost:3001](http://localhost:3001). For email links to use this port, set `APP_URL=http://localhost:3001`. Outside production, startup defaults to the demo.

```sh
docker compose up --build
```

The Compose demo also opens on port 3001 and persists data in a named volume. Docker packaging is provided; verify its runtime on a Docker-enabled host. See [deployment instructions](docs/DEPLOYMENT.md) for HTTPS, administrator bootstrap, SMTP, and backups.

## Architecture and scope

React + TypeScript + Vite; Express + Zod + Node cryptography; SQLite WAL. Fonts are bundled locally. No external analytics, AI calls, or required third-party services.

Amounts use integer paise; billing and receipts use atomic transactions. Unique cycle/payment keys protect retries. Indexes and bounded queries support thousands of records on one instance. [Architecture notes](docs/ARCHITECTURE.md) describe a PostgreSQL and worker-queue path for multiple instances.

Payments record funds already received; they do **not** charge cards. Email stays in the admin outbox until SMTP is configured. The ledger uses INR and UTC dates. Product changes apply to future cycles without proration. Reports show receipts and billing, not accrual accounting or jurisdiction-specific tax compliance.

The app is built and checked locally and pushed to GitHub. Public hosting is not provisioned.

| Path                       | Responsibility                                 |
| -------------------------- | ---------------------------------------------- |
| `src/`                     | Admin/staff workspace and customer portal      |
| `server/app.mjs`           | Routes, validation, roles, ownership           |
| `server/db.mjs`            | Schema, indexes, transactions, audit           |
| `server/subscriptions.mjs` | Lifecycle and future product changes           |
| `server/billing.mjs`       | Invoice math, billing, receipts, print         |
| `server/auth.mjs`          | Passwords and sessions                         |
| `server/mail.mjs`          | Outbox and optional SMTP                       |
| `server/reports.mjs`       | Scoped reports and CSV                         |
| `server/tests/`            | Automated invariant/workflow tests             |
| `scripts/benchmark.mjs`    | Isolated scale fixture                         |
| `docs/`                    | Requirements, architecture, demo, verification |

Implementation references: [Node SQLite](https://nodejs.org/api/sqlite.html), [Express security practices](https://expressjs.com/en/advanced/best-practice-security/), and [Vite](https://vite.dev/guide/).
