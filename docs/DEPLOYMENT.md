# Deployment and operations

## Live free deployment

Demo: https://brightloop-subscriptions.onrender.com

- Render **Free** Node 24 web service in Singapore, one instance, no paid disk.
- Turso **Free** hosted libSQL database in Singapore provides durable records.
- Brevo **Free** transactional email over HTTPS. No SMTP ports or paid domain needed.
- Fictional sample data: four customers and four subscriptions. The initial seed has three invoices; the live email demonstration adds a fourth invoice to an existing customer.

Render's free service sleeps when idle. The first request can be slow. Billing
catches up on startup and runs hourly while awake; this is not a guarantee of
precise scheduled billing. Email sends on request and queued messages are
checked every minute while awake. Data remains in Turso across restarts.
Provider free quotas apply. Keep each account on Free and do not enable paid
upgrades. Charges already incurred before the downgrade are not refunded by
this configuration.

## Configuration and deployment

`render.yaml` defines the service. Set these secrets/configuration directly in
Render's Environment page (never commit real values):

```dotenv
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=<database-scoped read/write token>
BREVO_API_KEY=<restricted transactional-email key>
MAIL_FROM_EMAIL=<verified sender email>
EMAIL_ALLOWED_RECIPIENTS=<comma-separated approved test inboxes>
```

The Blueprint enables `REQUIRE_REMOTE_DATABASE=true` to prevent silent fallback
to ephemeral storage, and `DEMO_MODE=true`. Public demo credentials are visible
on the login screen: do not enter real financial/customer records.
`RENDER_EXTERNAL_URL` supplies the public origin; override `APP_URL` for a custom
domain. Node binds `0.0.0.0` on Render's assigned port. `/api/health` is the health
check. Render secrets omitted from the Blueprint are preserved by syncs.

Push checkpoints to `main`, verify CI, then sync the Blueprint if configuration
changed. The connected service requests CI-gated automatic deploys, but this
public-repository setup required Dashboard manual sync/deploy during verification.
Confirm the new commit reaches `live`; a successful push alone is insufficient.

## Free email behavior

Verify the sender in Brevo. With a freemail sender, Brevo may rewrite the visible
address onto its authenticated `brevosend.com` domain. No marketing contacts or
campaigns are needed. The key is restricted to transactional email.

The public demo sends only to `EMAIL_ALLOWED_RECIPIENTS`. Fictional addresses
are blocked. This prevents public admin credentials from turning the app into
an unrestricted mail sender. Add judges' approved inboxes in Render if needed.
The app caps successful sends at 50 per UTC day; Brevo Free currently allows
300 per day across the account. Keep the provider on Free for its hard quota.

A `sent` status means provider acceptance. Confirm inbox arrival in provider
logs or the recipient mailbox. Failed sends can be retried from the outbox.
Password/reset invitation links expire after 30 minutes; expired queued links
are not sent. Request a fresh reset instead. Account links are hidden from the
public admin outbox. The verified invoice email contains itemized plain-text
amounts and a customer portal link, not a PDF attachment.

Brevo and Turso setup tokens created for this deployment expire after one year
(October 2027); Brevo also expires unused keys after 90 days. Rotate in provider
settings and update Render secrets before expiry. Without a configured provider,
mail stays in outbox mode. SMTP remains supported for other environments.

## Persistence and migration

When a remote database is configured, all application writes go to Turso; the
app does not depend on Render's local filesystem. Initial migration copies an
existing local workspace transactionally only when the remote users table is
empty. Existing remote workspaces are never overwritten. The deployed compact
workspace was migrated before removal of the old disk. A local, ignored backup
was saved at `tmp/brightloop-migrated-backup.db` and passed SQLite integrity check.

Use the Turso Dashboard export for future backups and verify restores separately.
The synchronous libSQL driver preserves the existing transaction boundaries but
blocks the Node event loop during remote calls. Suitable for this small demo;
use asynchronous database access and distributed job ownership before scaling.

## Local development and private workspaces

`npm ci` then `npm run dev` starts Vite on 5173 and API on 3001. Without Turso
variables, SQLite is stored in `data/brightloop.db`. `npm run build` creates the
frontend; `npm start` serves frontend and API together. `DATABASE_DRIVER=libsql`
exercises the alternative local driver in tests. Both drivers run in CI.

For a private workspace, use a new database with `DEMO_MODE=false`, bootstrap
`ADMIN_EMAIL` and a strong `ADMIN_PASSWORD`, then remove the bootstrap password.
Do not repurpose a database containing public demo accounts for real customers.
Docker/Compose files remain available for local persistent-disk hosting; the
container image has not been built in this environment.

Real card processing, refunds, tax compliance, multi-company tenancy, precise
always-on scheduling, production restore drills, and load-tested horizontal
scaling remain outside this hackathon deployment.
