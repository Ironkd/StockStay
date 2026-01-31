# Stripe Setup – Step by Step

Follow these steps in order. Use **Test mode** (toggle in the top-right of the Stripe Dashboard) while setting up.

---

## Step 1: Create a Stripe account

1. Go to **https://dashboard.stripe.com**
2. Click **Sign in** or **Create account**
3. Complete sign-up (email, password, etc.)
4. In the top-right, ensure **Test mode** is **ON** (orange) for testing

---

## Step 2: Get your Secret key

1. In the left sidebar, click **Developers**
2. Click **API keys**
3. Under **Standard keys**, find **Secret key**
4. Click **Reveal test key** (or copy the visible key)
5. Copy the key – it starts with `sk_test_`
6. Open your project’s **`server/.env`** and add:
   ```env
   STRIPE_SECRET_KEY=sk_test_paste_your_key_here
   ```
7. Save the file (do not commit `.env` to git)

---

## Step 3: Create the Pro product and monthly price

1. In the left sidebar, click **Product catalog**
2. Click **+ Add product**
3. **Name:** `StockStay Pro` (or any name)
4. **Description:** optional, e.g. `Pro plan – 10 warehouses, team members`
5. Leave **Image** empty (or add one)
6. Under **Pricing**, leave **One time** unchecked and **Recurring** selected
7. **Price:** enter the amount, e.g. `39` (for $39)
8. **Billing period:** **Monthly**
9. **Price description:** optional, e.g. `Pro monthly`
10. Click **Save product**
11. On the product page, under **Pricing**, you’ll see the price you just added
12. Click that price row to open it
13. Copy the **Price ID** (starts with `price_`, e.g. `price_1ABC...`)
14. In **`server/.env`** add:
    ```env
    STRIPE_PRO_PRICE_ID=price_paste_your_id_here
    ```
15. Save `.env`

---

## Step 4 (optional): Create Pro annual price

1. Stay on the **StockStay Pro** product page (or open it from Product catalog)
2. Click **Add another price**
3. **Price:** e.g. `390` (for $390/year, or your annual amount)
4. **Billing period:** **Yearly**
5. **Price description:** optional, e.g. `Pro annual`
6. Click **Save price**
7. Copy the new **Price ID**
8. In **`server/.env`** add:
   ```env
   STRIPE_PRO_ANNUAL_PRICE_ID=price_paste_annual_id_here
   ```
9. Save `.env`

---

## Step 5: Create the Starter product and monthly price

1. In the left sidebar, click **Product catalog**
2. Click **+ Add product**
3. **Name:** `StockStay Starter`
4. **Description:** optional, e.g. `Starter plan – 3 warehouses`
5. Under **Pricing**, **Recurring** selected:
   - **Price:** e.g. `18` (for $18/month)
   - **Billing period:** **Monthly**
6. Click **Save product**
7. Open the new price and copy the **Price ID**
8. In **`server/.env`** add:
   ```env
   STRIPE_STARTER_PRICE_ID=price_paste_starter_monthly_id_here
   ```
9. Save `.env`

---

## Step 6 (optional): Create Starter annual price

1. Open the **StockStay Starter** product
2. Click **Add another price**
3. **Price:** e.g. `180` (for $180/year)
4. **Billing period:** **Yearly**
5. Save and copy the **Price ID**
6. In **`server/.env`** add:
   ```env
   STRIPE_STARTER_ANNUAL_PRICE_ID=price_paste_starter_annual_id_here
   ```
7. Save `.env`

---

## Step 7: Set up the webhook (local development)

### Why you need this (Step 4 in short)

When a customer starts a trial or pays, **Stripe** needs to tell **your server** so your app can update the team’s plan (e.g. Pro, Starter) and warehouse limits. Stripe does that by calling a URL on your server – that’s a **webhook**.

- **On the internet:** Stripe would call something like `https://your-api.com/api/billing/webhook`.
- **On your machine:** Your server is at `http://localhost:3000`. Stripe **cannot** reach `localhost` from the internet, so Stripe has no way to call your app.

The **Stripe CLI** fixes this: it runs on your computer and acts as a **bridge**:

1. Stripe sends the event to **Stripe’s servers** (which the CLI is connected to).
2. The CLI receives it and **forwards** it to `http://localhost:3000/api/billing/webhook`.
3. Your server receives the webhook and updates the database.

So for local testing you need: **(1)** Stripe CLI installed, **(2)** one terminal where `stripe listen` is running, **(3)** the webhook signing secret from that terminal in your `.env`.

---

### 7a. Install Stripe CLI

Install the Stripe CLI on your computer (one-time):

- **macOS (Homebrew):**
  ```bash
  brew install stripe/stripe-cli/stripe
  ```
- **Windows (Scoop):**
  ```bash
  scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
  scoop install stripe
  ```
- **Or** download an executable from: **https://github.com/stripe/stripe-cli/releases**

Check it works:
```bash
stripe --version
```

---

### 7b. Log in to Stripe (one-time per machine)

1. Open a terminal (any folder is fine).
2. Run:
   ```bash
   stripe login
   ```
3. A browser window will open; log in to your Stripe account if asked.
4. When it says you’re logged in, you can close the browser and go back to the terminal.

---

### 7c. Forward webhooks to your local server

1. **Start your API** in one terminal (e.g. in the `server` folder run `npm run dev`). Your server must be listening on port 3000 (or change the URL below to match).
2. **Open a second terminal** (leave the server running in the first).
3. Run this command (you can run it from any folder; it doesn’t have to be inside `server`):
   ```bash
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```
4. You should see something like:
   ```text
   Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. **Copy that whole secret** (starts with `whsec_`). You’ll use it in the next step.
6. **Leave this terminal open** while you test checkout. If you close it, Stripe events will stop reaching your server.

---

### 7d. Put the webhook secret in `.env`

1. Open your project’s **`server/.env`** file.
2. Add a new line (use the secret you copied; it’s long and starts with `whsec_`):
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_paste_the_full_secret_here
   ```
3. Save the file.
4. **Restart your server** (stop and run `npm run dev` again in the server terminal) so it loads the new variable.

---

### 7e. When you test locally

Every time you want to test “Start Free Trial” or payments on your machine:

1. **Terminal 1:** Run your server (`npm run dev` in `server`).
2. **Terminal 2:** Run `stripe listen --forward-to localhost:3000/api/billing/webhook`.
3. Use your app; when you complete a Stripe checkout, the CLI will forward the event to your server and you’ll see log lines in both terminals.

If you don’t run `stripe listen`, checkout will still work in Stripe, but your app won’t get the event and the team’s plan won’t update.

---

## Step 8: Set up the webhook (production)

When you deploy your API to a real URL:

1. In Stripe Dashboard left sidebar: **Developers** → **Webhooks**
2. Click **+ Add endpoint**
3. **Endpoint URL:**  
   `https://your-actual-api-domain.com/api/billing/webhook`  
   (replace with your real backend URL)
4. Click **Select events**
5. In the list, select:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Click **Add endpoint**
7. On the new endpoint page, click **Reveal** under **Signing secret**
8. Copy the secret (`whsec_...`)
9. In your **production** environment (e.g. Railway, Render), set:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_production_secret
   ```
10. Use your **live** API key in production too:  
    `STRIPE_SECRET_KEY=sk_live_...`  
    and your **live** price IDs if you created them in Live mode.

---

## Step 9: Check your `.env`

Your **`server/.env`** should look like this (with your real values):

```env
# ... your existing vars (DATABASE_URL, JWT_SECRET, etc.) ...

STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_PRO_PRICE_ID=price_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx

# Optional – only if you created these in Stripe:
# STRIPE_PRO_ANNUAL_PRICE_ID=price_xxxx
# STRIPE_STARTER_PRICE_ID=price_xxxx
# STRIPE_STARTER_ANNUAL_PRICE_ID=price_xxxx
```

---

## Step 10: Restart your server and test

1. Restart your API (e.g. stop and run `npm run dev` in the `server` folder)
2. If testing locally, ensure **`stripe listen`** is still running
3. In your app, go to the Pricing page, log in as a team owner, and click **Start Free Trial** on Pro or Starter
4. You should be redirected to Stripe Checkout
5. Use Stripe’s test card: **4242 4242 4242 4242**, any future expiry, any CVC, any postal code
6. Complete checkout; you should be redirected back and your team plan should update (check Settings or DB)

---

## Quick reference – what to create in Stripe

| In Stripe | Purpose |
|-----------|--------|
| **API key** (Secret key) | Backend auth → `STRIPE_SECRET_KEY` |
| **Product: StockStay Pro** + monthly price | Pro monthly → `STRIPE_PRO_PRICE_ID` |
| **Product: StockStay Pro** + yearly price (optional) | Pro annual → `STRIPE_PRO_ANNUAL_PRICE_ID` |
| **Product: StockStay Starter** + monthly price | Starter monthly → `STRIPE_STARTER_PRICE_ID` |
| **Product: StockStay Starter** + yearly price (optional) | Starter annual → `STRIPE_STARTER_ANNUAL_PRICE_ID` |
| **Webhook** (CLI for dev, Dashboard for prod) | Signing secret → `STRIPE_WEBHOOK_SECRET` |

For more detail (flow, testing, production), see **STRIPE_SETUP.md**.
