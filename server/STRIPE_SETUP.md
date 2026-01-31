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

Without the first three, "Upgrade to Pro" will return a "Billing is not configured" style error.

## 7. Database migration

After adding the Stripe fields to the Prisma schema, run:

```bash
cd server
npx prisma migrate deploy
```

(Or `npx prisma migrate dev` for a new migration in development.)

## 8. Flow overview

- **Checkout**: User clicks "Upgrade to Pro" (Settings or Pricing) → backend creates a Stripe Checkout Session → user is redirected to Stripe → pays → redirected to `success_url` (e.g. `/dashboard?checkout=success`).
- **Webhook**: Stripe sends `customer.subscription.created/updated/deleted` to `/api/billing/webhook`. The server updates the team’s `plan`, `maxWarehouses`, and Stripe-related fields.
- **Customer portal**: "Manage subscription" opens Stripe’s Customer Portal (cancel, update payment method) using the team’s `stripeCustomerId`.

## 9. Testing

- Use **test mode** keys (`sk_test_...`, `price_...` from test mode) and Stripe test cards (e.g. `4242 4242 4242 4242`).
- After a test subscription is created, check the Team row in the DB: `plan` should be `pro`, `maxWarehouses` should be 10, `stripeCustomerId` and `stripeSubscriptionId` should be set.
- Cancel the subscription in the Customer Portal or in the Stripe Dashboard; the webhook should set the team back to `plan: free`, `maxWarehouses: 1`.
