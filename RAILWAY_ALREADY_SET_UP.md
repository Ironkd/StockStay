# Next steps (project already on Railway)

Your **inventory-app** is already a project on Railway. Do these steps in order.

---

## 1. Check the service uses the `server` folder

1. In **Railway** → open your **inventory-app** project → click the **service** (the one that runs the API).
2. Go to **Settings**.
3. **Root Directory:** must be **`server`**. If it’s blank or something else, set it to `server` and save.
4. **Build Command:** `npm install && npx prisma generate` (or add it if blank).
5. **Start Command:** `npm start` (or leave default if it’s already `npm start`).
6. Save. Let it redeploy if it does automatically.

---

## 2. Get (or create) a public URL

1. Same service → **Settings** → **Networking** (or **Public Networking**).
2. If there’s no domain yet: click **Generate Domain** (or **Add domain** → **Generate**).
3. Copy the URL (e.g. `https://inventory-app-api-production-xxxx.up.railway.app`). This is your **backend URL**.

---

## 3. Set environment variables on Railway

1. Same service → **Variables** tab.
2. Add or edit these. Use your real values.

**Required:**

| Variable        | Value |
|-----------------|--------|
| `NODE_ENV`      | `production` |
| `JWT_SECRET`    | Long random string (e.g. run `openssl rand -hex 32` and paste). |
| `DATABASE_URL`  | Your **Supabase** connection string (same as in `server/.env`). |

**Stripe (you have 4 prices – add all 4):**

| Variable                         | Value |
|----------------------------------|--------|
| `STRIPE_SECRET_KEY`              | From Stripe Dashboard → Developers → API keys. |
| `STRIPE_PRO_PRICE_ID`            | Pro **monthly** price ID (`price_...`). |
| `STRIPE_PRO_ANNUAL_PRICE_ID`     | Pro **annual** price ID. |
| `STRIPE_STARTER_PRICE_ID`        | Starter **monthly** price ID. |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | Starter **annual** price ID. |
| `STRIPE_WEBHOOK_SECRET`          | Leave empty for now; add in step 5 after creating the webhook. |

**After frontend is live (step 7):**

| Variable      | Value |
|---------------|--------|
| `CORS_ORIGIN` | Your Vercel URL, e.g. `https://inventory-app-xxx.vercel.app` (no trailing slash). |
| `APP_URL`     | Same as `CORS_ORIGIN`. |

3. Save. Wait for redeploy to finish.

---

## 4. Add Stripe production webhook

1. **Stripe Dashboard** → **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:** `https://YOUR-RAILWAY-URL/api/billing/webhook` (the URL from step 2).
3. **Events:** `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Create the endpoint → open it → **Reveal** the **Signing secret** → copy the `whsec_...` value.

---

## 5. Put webhook secret in Railway

1. **Railway** → same service → **Variables**.
2. Set **`STRIPE_WEBHOOK_SECRET`** to the `whsec_...` value you copied.
3. Save (and redeploy if needed).

---

## 6. Deploy frontend on Vercel and set API URL

1. **Vercel** → **Add New** → **Project** → import **inventory-app** (root = `.`, not `server`).
2. Before or after first deploy: **Settings** → **Environment Variables** → add:
   - **Name:** `VITE_API_BASE_URL`
   - **Value:** `https://YOUR-RAILWAY-URL/api` (backend URL from step 2 + `/api`)
3. Deploy (or redeploy). Copy your **Vercel URL**.

---

## 7. Set CORS and APP_URL on Railway

1. **Railway** → same service → **Variables**.
2. Add (with your real Vercel URL):
   - `CORS_ORIGIN` = `https://your-app.vercel.app`
   - `APP_URL` = same
3. Save. Let it redeploy.

---

## 8. Test

1. Open your **Vercel** URL.
2. Sign up or log in.
3. Go to **Pricing** → **Start Free Trial** → complete Stripe Checkout (test card `4242 4242 4242 4242`).
4. Check **Settings** – plan should show Pro or Starter.

---

**Summary:**  
1) Root = `server`, build/start set.  
2) Generate domain, copy backend URL.  
3) Env vars (DB, JWT, Stripe keys; webhook secret later).  
4) Stripe webhook → your backend URL.  
5) Webhook secret in Railway.  
6) Vercel frontend + `VITE_API_BASE_URL`.  
7) `CORS_ORIGIN` and `APP_URL` on Railway.  
8) Test in browser.
