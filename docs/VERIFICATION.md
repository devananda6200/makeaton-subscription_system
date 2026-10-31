# Verification record

Checked on **31 October 2026** with Node 24 on Windows. Executed checks are distinguished from supplied packaging.

## Automated checks executed

- `npm test`: **14 passing tests** covering calendar cycles, password policy/hashing, lifecycle guards, variant snapshots, discounts and rounding, duplicate billing, transaction rollback, receipts, ownership, roles, request origin, signup uniqueness, resets, and customer add-ons.
- The full HTTP workflow creates tax/product/variant/plan/template/subscription, activates and bills it, confirms and settles the invoice, queues email, prints, pauses/resumes/renews, and signs into the customer portal. It runs within the main suite or with `npm run test:workflow`.
- `npm run build`: strict TypeScript check and optimized Vite build pass; fonts ship locally.
- Dependency installation reported zero vulnerabilities at verification time; CI repeats a production-dependency audit.
- GitHub Actions passed the same tests, build, and audit on Ubuntu/Node 24: [verified workflow run](https://github.com/devananda6200/makeaton-subscription_system/actions/runs/41170268571).

## Browser checks executed

The connected browser visibly verified:

1. Admin demo login and live metrics.
2. Growth-template subscription creation for the portal customer.
3. Draft → Quotation → Confirmed → Active transitions.
4. Billing and invoice line/tax/discount calculations.
5. A ₹2,000 partial receipt, remaining balance, final settlement, Paid status, and payment history.
6. Invoice email queueing.
7. Customer access to its own subscription and invoice.
8. Add-on removal with base-product controls disabled, followed by pause/resume.
9. Desktop/handheld layout review, including readability and narrow-screen navigation fixes.
10. Built frontend served directly by Express on port 3001, with no console errors; CSV export downloaded and its values checked; printable invoice rendered with the correct settled total.

No browser console errors were reported during the main workflow. Browser checks used the connected browser directly and are separate from the automated API/domain tests.

The handheld portal had matching document and viewport widths (377 CSS pixels), with no page-level horizontal overflow. [Desktop](assets/overview.jpg) and [customer portal](assets/customer-mobile.jpg) screenshots are included.

## Performance executed

`npm run benchmark` uses a separate temporary disk-backed database. It never modifies the working app's records. Fixture: **10,000 subscriptions, 60,000 invoices, 50,000 receipts**. Each operation gets a warm-up and 20 measured HTTP requests.

| HTTP operation               |      p50 |      p95 |  Maximum |
| ---------------------------- | -------: | -------: | -------: |
| Paginated subscriptions      |  15.6 ms |  16.9 ms |  17.4 ms |
| Filtered subscription search |  15.5 ms |  16.9 ms |  17.1 ms |
| Overdue invoice list         |  46.5 ms |  48.1 ms |  48.3 ms |
| Revenue dashboard            | 630.2 ms | 661.8 ms | 674.8 ms |

A transaction generated **1,000 invoices in 300.9 ms**. All measured page APIs stayed below two seconds at p95 on this machine.

These are serial local requests, not concurrent-load, public-network, browser-render, or production SLA measurements. Hardware, traffic, and storage affect results. See the PostgreSQL/queue path in [architecture notes](ARCHITECTURE.md).

## Provided but not externally verified

- Docker image/Compose packaging: build and run on a Docker-enabled host.
- SMTP transport: local testing used the outbox, not a live provider.
- Public hosting, domain/TLS setup, payment-provider integration, and production restore drills.

No claim of public deployment or real card processing is made.
