# Stripe Billing Setup (StockStay Pro)

This guide walks you through configuring Stripe so "Upgrade to Pro" and subscription management work.

## 1. Stripe account and keys

1. Create or sign in at [Stripe Dashboard](https://dashboard.stripe.com).
2. Get your **Secret key**: Developers → API keys → Secret key (`sk_test_...` for test, `sk_live_...` for production).
3. Add to `server/.env`:
   ```env
   STRIPE_SECRET_KEY=sk_test_xxxx
   ```

## 2. Create the Pro product and price

1. In Stripe: **Products** → **Add product**.
2. Name: e.g. **StockStay Pro**.
3. Add a **Price**:
   - Type: **Recurring**.
   - Billing period: **Monthly** (or Annual if you prefer).
   - Amount: e.g. **$29** (or match your pricing page).
4. Save. Copy the **Price ID** (starts with `price_`).
5. Add to `server/.env`:
   ```env
   STRIPE_PRO_PRICE_ID=price_xxxx
   ```

## 3. Webhook (required for subscription sync)

Stripe will call your server when a subscription is created, updated, or canceled so the app can update the team’s plan and warehouse limits.

### Local development (Stripe CLI)

1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli).
2. Login: `stripe login`.
3. Forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```
4. The CLI will print a **webhook signing secret** (`whsec_...`). Add it to `server/.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxx
   ```
5. Restart your server and trigger a test checkout; the CLI will forward the event to `localhost:3000/api/billing/webhook`.

### Production

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**.
2. Endpoint URL: `https://your-api-domain.com/api/billing/webhook`.
3. Events to send:  
   - `customer.subscription.created`  
   - `customer.subscription.updated`  
   - `customer.subscription.deleted`
4. After creating the endpoint, open it and reveal the **Signing secret** (`whsec_...`).
5. Set in your production environment:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxx
   ```

## 4. How many price IDs? (1 vs 4)

- **Minimum:** You need **one** price ID: `STRIPE_PRO_PRICE_ID` (Pro monthly). That’s enough for "Upgrade to Pro" and the Pricing page monthly option.
- **Optional – 4 price IDs:** If you want **Starter** and **Pro**, each with **monthly** and **annual** billing, create four prices in Stripe and set all four in `.env`:
  - `STRIPE_PRO_PRICE_ID` – Pro monthly  
  - `STRIPE_PRO_ANNUAL_PRICE_ID` – Pro annual  
  - `STRIPE_STARTER_PRICE_ID` – Starter monthly  
  - `STRIPE_STARTER_ANNUAL_PRICE_ID` – Starter annual  

The app uses the Pricing page toggle (Monthly/Annual) and the plan (Pro or Starter) to pick the right price. If an annual price isn’t set, it falls back to the monthly price for that plan.

## 4b. Extra user add-on ($5/user/month)

Starter (3 users) and Pro (5 users) can add extra user slots at **$5/month per slot** (Starter: max 2 extra, Pro: max 3 extra). To enable this:

1. In Stripe: **Products** → **Add product**.
2. Name: e.g. **StockStay Extra User**.
3. Add a **Price**:
   - Type: **Recurring**.
   - Billing period: **Monthly**.
   - Amount: **$5** (or your chosen amount).
4. Save. Copy the **Price ID** (starts with `price_`).
5. Add to `server/.env`:
   ```env
   STRIPE_EXTRA_USER_PRICE_ID=price_xxxx
   ```
6. The app will add this as a **subscription item** when an owner changes extra user slots (e.g. in Settings). The webhook already syncs `extraUserSlots` from the subscription’s extra-user line item.

**API:** Team owners can set the number of extra slots with `PATCH /api/billing/extra-user` and body `{ "quantity": 0 }` (0, 1, or 2 for Starter; 0, 1, 2, or 3 for Pro). The server updates the Stripe subscription and the DB.

## 5. Free trial (Pro and Starter) → then auto-charge

**Default behavior:** Every new subscription (Pro or Starter) gets a **14-day free trial**. The customer enters their card at checkout; Stripe does not charge until day 15, then bills monthly (or annually) as usual.

- **Pro:** "Start Free Trial" on Pricing (or "Upgrade to Pro" in Settings) → Stripe Checkout with 14-day trial → after 14 days Stripe charges the monthly (or annual) price.
- **Starter:** "Start Free Trial" on Pricing → same 14-day trial, then Stripe charges the Starter price.

To **charge immediately** (no trial), the frontend can send `stripeTrialDays: 0` when creating the checkout session.

**Optional – app-only trial (no card):** The app also supports a separate "Start 14-day Pro trial" at signup (no Stripe, no card). That is independent of the Stripe trial above.

## 6. Environment summary

In `server/.env` you should have:

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes (for billing) | Secret key from Stripe Dashboard. |
| `STRIPE_PRO_PRICE_ID` | Yes (for checkout) | Price ID for Pro (monthly). |
| `STRIPE_WEBHOOK_SECRET` | Yes (for sync) | Webhook signing secret (CLI for dev, Dashboard for prod). |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | No | Pro annual price (if you offer annual). |
| `STRIPE_STARTER_PRICE_ID` | No | Starter monthly (if you offer Starter). |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | No | Starter annual (if you offer Starter annual). |
| `STRIPE_EXTRA_USER_PRICE_ID` | No | Extra user add-on ($5/mo per slot). Required for add/remove extra user slots in Settings. |

Without the first three, "Upgrade to Pro" will return a "Billing is not configured" style error. Without `STRIPE_EXTRA_USER_PRICE_ID`, extra user slot changes will fail with a configuration error.

## 7. Database migration

After adding the Stripe fields to the Prisma schema, run:

```bash
cd server
npx prisma migrate deploy
```

(Or `npx prisma migrate dev` for a new migration in development.)

## 8. Flow overview

- **Manage subscription**: In Settings, team owners click "Manage subscription" → backend ensures a Stripe Customer exists, then opens Stripe’s Customer Portal. In the portal users can subscribe (Pro monthly/annual, Starter), change billing (monthly ↔ yearly), cancel, or downgrade.
- **Webhook**: Stripe sends `customer.subscription.created/updated/deleted` to `/api/billing/webhook`. The server updates the team’s `plan`, `maxWarehouses`, `billingInterval`, and Stripe-related fields.
- **Checkout** (Pricing/signup): Direct Checkout links still work for trials and Pricing page; the main in-app flow is via the Customer Portal.

## 8b. Customer Portal configuration (monthly/yearly, cancel, downgrade)

So that "Manage subscription" shows **monthly and yearly** options and allows **cancel** and **downgrade**:

1. Stripe Dashboard → **Settings** → **Billing** → **Customer portal**.
2. Under **Products**, add the products/prices you want customers to see (e.g. Pro monthly, Pro annual, Starter monthly, Starter annual). Customers can then subscribe or switch between them.
3. Enable **Customers can cancel their subscriptions** (and optional cancellation reasons).
4. Optionally configure a **Cancellation** flow (e.g. downgrade to Free or Starter before canceling).

After saving, opening "Manage subscription" from the app will show these options on the Stripe-hosted page.

## 9. Testing

- Use **test mode** keys (`sk_test_...`, `price_...` from test mode) and Stripe test cards (e.g. `4242 4242 4242 4242`).
- After a test subscription is created, check the Team row in the DB: `plan` should be `pro`, `maxWarehouses` should be 10, `stripeCustomerId` and `stripeSubscriptionId` should be set.
- Cancel the subscription in the Customer Portal or in the Stripe Dashboard; the webhook should set the team back to `plan: free`, `maxWarehouses: 1`.
