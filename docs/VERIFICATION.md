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
- Custom domain setup, payment-provider integration, and production restore drills.

Public Render hosting is verified below. No claim of real card processing is made.

## Render live verification — 31 October 2026

- Live demo: https://brightloop-subscriptions.onrender.com
- Service: `srv-dbipv6nlk1mc73fdoui0` in Festin's workspace, Singapore.
- Deploy `dep-dbipv77lk1mc73fdp0b0` reached `live` on source commit `3f8f4e7c4a1cdb876f019114cb5316547f3cd676`.
- HTTPS health endpoint returned `status=ok`; authentication metadata confirmed demo mode and outbox email mode.
- Browser admin demo login succeeded and populated the revenue dashboard, subscriptions, invoices, and renewal summary.
- Render confirmed one instance and a 1 GB disk mounted at `/opt/render/project/src/data`. Persistence across a restart and backup restoration were not exercised.
- Base estimate shown by Render: $7/month compute + $0.25/month disk, excluding additional usage/taxes.
- Live dashboard evidence: [screenshot](assets/render-live.png).

## Free hosting and real email — 31 October 2026

- Render deploy `dep-dbiq9mvlk1mc73felqrg` reached `live` on `52a70d8`.
- Render service API confirms `plan=free` and no attached disk. The previous paid disk was deleted after user confirmation, remote migration, and a local integrity-checked backup.
- The live app preserved four customers, four subscriptions, four invoices and two payments across migration/redeploy. The fourth invoice was created through the real subscription workflow for email verification.
- Turso remote writes and transaction rollback passed; all 15 tests passed with both Node SQLite and local libSQL drivers. CI now exercises both drivers. Production build passed.
- HTTPS health, browser admin login, customer/subscription/invoice listing, report queries, and Brevo mode all passed on the Free deployment.
- Portal invitation, invoice INV-00004, and password-reset email were accepted by Brevo and independently found in the approved Gmail inbox. No reset-token values are recorded here.
- The public admin outbox hides security links; a test verifies this behavior. Delivery is limited to explicitly approved recipients and 50 successful sends per UTC day.
- The current Free setup supersedes the earlier paid hosting estimate. Historical charges already accrued are separate. Free Render cold starts and delayed scheduling while asleep remain expected.

Final report verification: remote libSQL named bindings differed from local
SQLite behavior. Commit `e364aa2` converts report filters to positional bindings;
Render deploy `dep-dbiqbess728c7381676g` is live. The browser now shows four active
subscriptions, MRR of INR 11,092.08, and two payments totaling INR 3,231.07.
All 16 tests pass on both local drivers, with an additional check against the
real remote database. [Current demo screenshot](assets/free-live-demo.png).

## Registered-recipient email and abuse limits — 31 October 2026

This checkpoint supersedes the earlier recipient allowlist and successful-send-only quota.

- `7ba1ba7`: registered recipients, persistent queue/IP/attempt limits, transactional delivery reservations, reset cooldown, and failure/retry protections.
- `38cb0e3`: user-facing outbox guidance and deployment documentation.
- All 18 tests passed on both Node SQLite and local libSQL, including non-allowlisted registered recipients, blocked strangers/fictional addresses, expired links, failed-send budgets, retry throttling, security capacity, queue bounds, generic reset responses, retained reset links and persistent IP throttling.
- Production build and production dependency audit passed (zero vulnerabilities). GitHub CI passed for both commits.
- Render deployment `dep-dbiqflou01pc73dm247g` reached `live` on `38cb0e3`. Service remains Free.
- Live health, public admin login and latest frontend asset passed. Two consecutive requests for the authorized inbox produced exactly one new reset email, accepted by Brevo and independently confirmed in Gmail INBOX. No security tokens were exposed in the public outbox.
- Four customers, four subscriptions and four invoices remain; no test accounts were added to the live demo. Registered-recipient expansion and invoice quota edge cases were tested with mocked provider delivery, without sending to third-party inboxes.
- [Live outbox evidence](assets/registered-email-live.png).
