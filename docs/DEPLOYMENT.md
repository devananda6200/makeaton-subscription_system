# Deployment and operations

## Local modes

`npm run dev` starts Vite on 5173 and the API on 3001. The development proxy keeps API calls same-origin. `npm run build` checks TypeScript and creates `dist/`; `npm start` serves the built frontend and API from one process.

Non-production boot defaults to fictional demo data. Copy `.env.example` to ignored `.env` for overrides. For the built app, set `APP_URL=http://localhost:3001` so email links return to that port.

`docker compose up --build` starts the local demo on port 3001 with a named volume and health check. Docker files are supplied but the image was not built in this environment; validate it on your Docker host.

## Production

### Render hackathon deployment

The root `render.yaml` provisions one Node 24 web service in Singapore with a
1 GB persistent disk, `/api/health` readiness checks, and deployment after CI
checks pass. The Express process serves both the built frontend and API.
This is paid compute plus disk storage; review the current Render estimate.

The Blueprint intentionally enables **fictional demo mode**, including the
published demo accounts. Never enter real customer data in this public demo.
To deploy a private workspace instead, set `DEMO_MODE=false`, change
`DATABASE_PATH` to a fresh filename on the disk, and provide `ADMIN_EMAIL` and
`ADMIN_PASSWORD` through Render's secret environment settings before startup.

Deploy from the repository using:
<https://dashboard.render.com/blueprint/new?repo=https://github.com/devananda6200/makeaton-subscription_system>

Select the intended workspace, connect the GitHub repository if prompted, and
review/apply the Blueprint. Verify the deploy reaches `live`, the health route
returns HTTP 200, and login works over HTTPS. The app uses Render's
`RENDER_EXTERNAL_URL` automatically unless `APP_URL` is explicitly supplied.
Set `APP_URL` when adding a custom domain.

Keep exactly one instance and the disk mount unchanged. Disk-backed deploys
have a short interruption. SMTP is optional and remains unconfigured until
credentials are supplied; messages remain in the outbox in the meantime.

### Private workspace configuration

Use Node 24+ or the container, exactly **one application instance**, an HTTPS reverse proxy, and a durable local database volume. Do not share a SQLite file between machines or use ephemeral storage.

Configure these through the host's secret manager:

```dotenv
NODE_ENV=production
DEMO_MODE=false
APP_URL=https://billing.your-domain.example
HOST=0.0.0.0
PORT=3001
DATABASE_PATH=/app/data/production.db
ADMIN_EMAIL=your-admin@your-domain.example
ADMIN_PASSWORD=<unique strong secret>
```

The administrator settings are required only for the first boot into an empty database. Passwords need 9+ characters, uppercase, lowercase, and a symbol. Remove the bootstrap password from runtime configuration after initialization. Demo credentials/data must not be used for real customers; production with demo disabled rejects a tagged demo database.

Set `TRUST_PROXY=1` only when the service sits behind exactly one trusted proxy; otherwise configure the deployment deliberately. IP-based rate limiting depends on this setting. `APP_URL` must exactly match the public HTTPS origin for origin validation and email links. Production cookies require HTTPS.

Compose binds to `127.0.0.1:3001` so a local HTTPS proxy can front it. Use a fresh persistent volume/database path when moving to production.

## Email

```dotenv
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_USER=<username>
SMTP_PASS=<secret>
MAIL_FROM=Brightloop <billing@your-verified-domain.example>
```

Port 465 uses immediate TLS; other ports use STARTTLS behavior. Use a verified sender. Without SMTP, messages stay in the admin outbox and are never described as delivered. Failed deliveries can be retried. Reset/invitation links expire after 30 minutes.

## Operations

- Production startup catches up billing; the hourly scheduler drains later backlogs in bounded transactions.
- Keep the process running for scheduled work. A sleeping host catches up only after wake-up.
- Monitor `/api/health`, process failures, disk space, failed email, overdue balances, and job logs.
- Back up with SQLite's online backup API or with the process stopped. Copying only a live `.db` can miss WAL transactions. Verify restores separately.
- Keep the DB, WAL, and shared-memory files on the same persistent directory.
- Upgrade with a backup. The MVP uses additive table/index initialization; introduce versioned migrations for structural production changes.
- Do not commit `.env`, databases, or real exports.

## Boundary

This is a tested hackathon application with INR/UTC billing and single-instance persistence. Card acquiring, refunds, credit notes, multi-company tenancy, jurisdiction-specific tax compliance, distributed jobs, and accrual accounting require additional implementation and operational checks. Public demo hosting is verified at https://brightloop-subscriptions.onrender.com (see VERIFICATION.md). Real SMTP delivery and production restore drills remain unverified.


## Compact public demo

The demo seed contains four customers, four subscriptions (three active and one quotation), and three invoices with unpaid, paid, and partially paid examples. Render now uses `brightloop-demo-small.db` on the existing disk. The previous `brightloop-demo.db` remains untouched for recovery; it is not loaded by the app.

## Brevo Free email delivery

Use Brevo's Free plan; do not enable paid upgrades or add-ons. Verify a sender
in Brevo and set `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, and
`EMAIL_ALLOWED_RECIPIENTS` through hosting secret settings. The allowlist is a
comma-separated set of real inboxes permitted to receive mail from the public
admin demo. No provider key is exposed to the frontend or committed to Git.

Brevo uses HTTPS, so SMTP ports are unnecessary. The app attempts queued mail
on demand and every minute while running, with a limit of 50 successful sends
per UTC day per database. Brevo's Free plan currently allows 300 emails/day
across the provider account; keep the account on Free for its provider-side
limit. The local cap resets if an ephemeral database is recreated.

Fictional addresses never receive real mail. Expired password-reset messages
fail with instructions to request a new link. Account links are hidden from
the admin outbox; they remain available to the recipient by email. A `sent`
status means provider acceptance, not proof of arrival; verify the recipient
inbox and Brevo delivery logs during setup. Failed messages can be retried
from the outbox after correcting configuration. No automatic paid fallback.
