# A five-minute Brightloop demonstration

## Opening, 20 seconds

“Brightloop runs subscriptions in spreadsheets today. Renewals get missed, invoice totals drift, and finance cannot trust a revenue number. We connected the entire month—from a quotation to a paid invoice—in one workspace.”

Choose **Workspace admin** on the sign-in page. Explain that the fictional records are persisted and every dashboard figure changes with the demo.

## 1. Show the business, 40 seconds

Point out MRR, active subscriptions, cash collected, and outstanding balances. Open an overdue invoice to show line items and payment history. Explain that contractual recurring revenue and actual cash receipts are distinct metrics.

## 2. Make an offer, 60 seconds

1. Click **New subscription** and choose **Growth team bundle**.
2. Select **Acme Studio**, keeping today's start date and the default term.
3. Show the product lines and base fee, then **Create draft**.
4. Open the newest subscription in the list.
5. Click **Create quotation**, **Confirm subscription**, and **Activate subscription**.

Point out the template's validity period and server-enforced transitions.

## 3. Let billing do the work, 60 seconds

1. Open Invoices → **Run billing** → **Run billing now**.
2. Open **Review draft invoices** and the newest invoice for the new subscription.
3. Show the automatic **Growing together · 10%** seat discount, followed by tax.
4. Confirm the invoice and open **Print / PDF** if time allows.
5. Run billing again to show that an existing cycle is not billed twice.

“The invoice, discount usage, and billing cursor commit together. A failure rolls them all back.”

## 4. Follow the money, 50 seconds

1. Record a fictional ₹2,000 UPI receipt.
2. Show the reduced outstanding balance and payment history.
3. Record the remainder. The invoice becomes **Paid**.
4. Email it, then open Settings → **Email outbox** to preview the queued message.

These are receipt records, not card charges. SMTP is optional, and the outbox makes the message visible during the demo.

## 5. Give customers control, 50 seconds

1. Sign out and choose **Customer portal**.
2. Open the Acme subscription and its paid invoice.
3. **Manage add-ons**, remove Workflow automation, and save.
4. Show that the next cycle changes while the existing invoice remains intact.
5. Pause and resume the subscription; optionally extend its term with **Renew term**.

Only this customer's records appear. Base-product and staff controls are unavailable.

## Close, 20 seconds

“One trustworthy loop: offer, subscription, billing, payment, insight. We tested the financial and authorization rules and measured a 10,000-subscription workspace. The demo runs without paid services and is reproducible.”

## Judge questions

| Question             | Answer                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Duplicate invoices?  | Unique subscription/cycle key plus an atomic transaction.                                      |
| January 31?          | Calendar-aware arithmetic retains the original billing anchor.                                 |
| Duplicate payments?  | Receipt idempotency and overpayment validation.                                                |
| Hardcoded dashboard? | No: fictional seed records, real queries.                                                      |
| Server downtime?     | Production startup and hourly jobs catch up missed cycles.                                     |
| Scale?               | A 10k-subscription / 60k-invoice local benchmark; documented PostgreSQL/queue growth path.     |
| Deployable?          | Production build, Docker definition, persistent volume, health check, HTTPS/SMTP instructions. |
| Card charging?       | Not in this MVP; received payments are recorded and reconciled.                                |

## Before presenting

- Run `npm ci`, `npm test`, and `npm run build`.
- Start `npm run dev`. Fonts and assets are local; no internet is required after installing dependencies.
- For a fresh demo, stop the server and choose a **new** `DATABASE_PATH`; it seeds automatically without deleting existing records.
- Keep [architecture](ARCHITECTURE.md) and [verification](VERIFICATION.md) notes ready.
