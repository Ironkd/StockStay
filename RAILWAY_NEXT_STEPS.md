# Next steps: Railway backend + Vercel frontend (detailed)

Use this guide step by step. You’re using **Railway** for the backend and **Supabase** for the database.

---

## What you’ll do

1. Deploy the **backend** on Railway (from the `server` folder).
2. Set **env vars** on Railway (DB, JWT, Stripe, then CORS/APP_URL after frontend is live).
3. Add the **Stripe production webhook** and put its secret in Railway.
4. Deploy the **frontend** on Vercel and set `VITE_API_BASE_URL`.
5. Set **CORS_ORIGIN** and **APP_URL** on Railway to your Vercel URL.
6. Test login and Stripe checkout.

---

# Part 1: Backend on Railway

## Step 1: Open Railway and create a project

1. Go to **https://railway.app** and log in (GitHub is fine).
2. On the dashboard, click **New Project**.
3. Choose **Deploy from GitHub repo**.
4. If prompted, **connect GitHub** and authorize Railway.
5. Select the **inventory-app** repository and confirm.
6. Railway will create a project and add a **service** (one deployable app). Click that service to open it.

---

## Step 2: Set the service to use the `server` folder

1. In the service, open the **Settings** tab (gear icon or “Settings” in the left sidebar).
2. Find **Root Directory** (or **Source** → Root Directory).
3. Set it to: **`server`**  
   (no slash, no path – just `server`).  
   This makes Railway build and run from your `server` folder.
4. Find **Build Command**. Set it to:
   ```bash
   npm install && npx prisma generate
   ```
5. Find **Start Command** (or **Start**). Set it to:
   ```bash
   npm start
   ```
6. Save if there’s a **Save** button.

---

## Step 3: Give the service a public URL

1. In the same service, open the **Settings** tab.
2. Find **Networking** or **Public Networking** (or **Generate Domain**).
3. Click **Generate Domain** (or **Add domain** → **Generate**).  
   Railway will assign a URL like:  
   `https://inventory-app-api-production-xxxx.up.railway.app`
4. **Copy this URL** and keep it somewhere – you’ll use it as your **backend URL** in:
   - Frontend env (`VITE_API_BASE_URL`)
   - Stripe webhook URL
   - Later: `CORS_ORIGIN` and `APP_URL`

---

## Step 4: Add environment variables on Railway

1. In the service, open the **Variables** tab (or **Settings** → **Variables**).
2. Click **Add Variable** (or **New Variable**) and add these **one by one**.  
   Use the **exact** key names; values are yours.

**Required (add these first):**

| Variable name   | Where to get the value |
|-----------------|-------------------------|
| `NODE_ENV`      | Type: `production` |
| `JWT_SECRET`    | Generate: run in Terminal `openssl rand -hex 32` and paste the output. Or use any long random string (e.g. 32+ characters). |
| `DATABASE_URL`  | **Supabase:** Dashboard → Project Settings → Database → **Connection string** → **URI**. Copy the full URL (starts with `postgresql://`). Prefer the **connection pooling** (port **6543**) URL if you see it. Paste exactly. |

**Stripe (add these):**

| Variable name           | Where to get the value |
|-------------------------|-------------------------|
| `STRIPE_SECRET_KEY`     | Stripe Dashboard → Developers → API keys → **Secret key** (`sk_test_...` or `sk_live_...`). |
| `STRIPE_PRO_PRICE_ID`   | Stripe Dashboard → Products → your Pro product → open the **monthly** price → copy **Price ID** (`price_...`). |
| `STRIPE_WEBHOOK_SECRET` | Leave **empty** for now. You’ll fill it in **Step 7** after creating the Stripe webhook. |

**Do not add `CORS_ORIGIN` or `APP_URL` yet.** You’ll add them in **Step 10** after the frontend is deployed.

3. Save / apply. Railway will redeploy the service when you change variables (or you can trigger a deploy from the **Deployments** tab).

---

## Step 5: Check the deploy

1. Go to the **Deployments** tab for the service.
2. Wait until the latest deployment shows **Success** (or **Active**).
3. If it fails, open the deployment and read the **build** or **runtime** logs; fix the error (often a missing env var or wrong Root Directory).
4. When it’s green, open your **backend URL** in the browser. You might see “Cannot GET /” or a similar message – that’s normal. The API lives under `/api/...` (e.g. `/api/auth/login`).  
   So the backend is up when that URL loads without a connection error.

---

# Part 2: Stripe production webhook

## Step 6: Create the webhook in Stripe

1. Go to **https://dashboard.stripe.com** and log in.
2. Use **Test mode** (toggle top-right) if you want to test with test cards; use **Live** when you’re ready for real payments.
3. In the left sidebar: **Developers** → **Webhooks**.
4. Click **Add endpoint** (or **+ Add an endpoint**).
5. **Endpoint URL:**  
   `https://YOUR-RAILWAY-URL/api/billing/webhook`  
   Replace `YOUR-RAILWAY-URL` with the URL you copied in Step 3 (no trailing slash).  
   Example: `https://inventory-app-api-production-xxxx.up.railway.app/api/billing/webhook`
6. Click **Select events**.
7. In the list, select:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
8. Click **Add endpoint**.
9. On the new endpoint’s page, find **Signing secret** and click **Reveal**.
10. Copy the value (starts with `whsec_...`). You’ll use it in the next step.

---

## Step 7: Put the webhook secret in Railway

1. Back in **Railway** → your service → **Variables**.
2. Add a variable (or edit if you left it empty):
   - **Name:** `STRIPE_WEBHOOK_SECRET`
   - **Value:** the `whsec_...` string you just copied from Stripe.
3. Save. Railway will redeploy.  
   Your backend can now receive Stripe subscription events in production.

---

# Part 3: Frontend on Vercel

## Step 8: Deploy the frontend to Vercel

1. Go to **https://vercel.com** and log in (e.g. with GitHub).
2. Click **Add New** → **Project** (or **Import Project**).
3. **Import** the **inventory-app** repository (connect GitHub if asked).
4. On the **Configure Project** screen:
   - **Root Directory:** leave as **`.`** (project root). Do **not** set it to `server`.
   - **Framework Preset:** Vercel usually detects **Vite**; leave it.
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install` (default is fine)
5. **Do not** click Deploy yet. First add the env var in Step 9, then deploy.

---

## Step 9: Set the API URL on Vercel

1. On the same Vercel project configuration page, find **Environment Variables** (or go to **Settings** → **Environment Variables** after creating the project).
2. Add one variable:
   - **Name:** `VITE_API_BASE_URL`
   - **Value:** `https://YOUR-RAILWAY-URL/api`  
     Use the **same** Railway URL from Step 3, with `/api` at the end. No trailing slash.  
     Example: `https://inventory-app-api-production-xxxx.up.railway.app/api`
3. Set it for **Production** (and **Preview** if you want).
4. Click **Deploy** (or **Save** and then trigger a deploy from the **Deployments** tab).

---

## Step 10: Get your frontend URL

1. After the deploy finishes, Vercel shows the project URL, e.g.:  
   `https://inventory-app-xxxx.vercel.app`
2. **Copy this URL** – this is your **frontend URL**.

---

# Part 4: Point backend at frontend (CORS + redirects)

## Step 11: Set CORS and APP_URL on Railway

1. In **Railway** → your backend service → **Variables**.
2. Add two variables (use your **real** Vercel URL from Step 10):

| Variable name   | Value |
|-----------------|--------|
| `CORS_ORIGIN`   | `https://inventory-app-xxxx.vercel.app` (your Vercel URL, no trailing slash) |
| `APP_URL`       | Same as `CORS_ORIGIN` |

3. Save. Railway will redeploy.  
   After this, the API will accept requests from your Vercel frontend and redirect links (e.g. password reset, Stripe success) will point to the right place.

---

# Part 5: Test

## Step 12: Test login and Stripe

1. Open your **Vercel** URL in the browser (e.g. `https://inventory-app-xxxx.vercel.app`).
2. **Sign up** (create an account) or **log in** if you already have one.
   - If login fails: check Railway **Deployments** → latest deploy → **View Logs**. Confirm `DATABASE_URL` and `JWT_SECRET` are set and that the app starts without errors.
3. Go to **Pricing** and click **Start Free Trial** on Pro or Starter.
4. You should be redirected to **Stripe Checkout**. Use test card **4242 4242 4242 4242** (if Stripe is in Test mode), any future expiry, any CVC.
5. Complete checkout. You should be redirected back to your app (e.g. dashboard or success URL).
6. Open **Settings** and confirm the plan shows **Pro** or **Starter**.
   - If the plan doesn’t update: in Stripe go to **Developers** → **Webhooks** → your endpoint and check for failed events. Confirm `STRIPE_WEBHOOK_SECRET` on Railway matches the **Signing secret** for that endpoint and that the webhook URL is exactly your Railway URL + `/api/billing/webhook`.

---

# Checklist (summary)

- [ ] Railway project created; repo **inventory-app** connected.
- [ ] Service **Root Directory** = `server`; **Build** = `npm install && npx prisma generate`; **Start** = `npm start`.
- [ ] **Generate Domain** done; backend URL copied.
- [ ] Railway **Variables**: `NODE_ENV`, `JWT_SECRET`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, then `STRIPE_WEBHOOK_SECRET` (after webhook), then `CORS_ORIGIN` and `APP_URL` (after Vercel).
- [ ] Stripe **Webhooks** → new endpoint → URL = Railway URL + `/api/billing/webhook`; events = subscription created/updated/deleted; **Signing secret** copied to Railway as `STRIPE_WEBHOOK_SECRET`.
- [ ] Vercel project from **inventory-app**; root = `.`; **VITE_API_BASE_URL** = Railway URL + `/api`; frontend URL copied.
- [ ] Railway **CORS_ORIGIN** and **APP_URL** = Vercel URL; redeploy.
- [ ] Test: Vercel URL → sign up / log in → Pricing → Start Free Trial → pay with test card → Settings shows correct plan.

If something fails at a specific step (e.g. build error, 403 on login, webhook 400), note the step and the error message and you can fix that next.
