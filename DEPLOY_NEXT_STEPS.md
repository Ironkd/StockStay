# Detailed next steps: deploy and test later

You’ll deploy the **backend** first, then the **frontend**, set env vars and Stripe, then test once everything is live.

---

## Supabase vs backend host

- **Supabase** = your **database** (PostgreSQL). You’re already using it; `DATABASE_URL` in `server/.env` points at Supabase. Supabase does not run a Node/Express server.
- **Backend host** = where your **Node API** (`server.js`) runs. That has to live somewhere: **Railway**, **Render**, **Fly.io**, etc. You only need **one** of these.

So: **Supabase** = DB. **Railway or Render** = API. Both are needed.

---

## Overview

| Step | What | Where |
|------|------|--------|
| 1 | Deploy backend (Node API) | Railway or Render |
| 2 | Set backend env vars | Railway/Render dashboard |
| 3 | Run DB migrations (production) | One-time from your machine |
| 4 | Add Stripe production webhook | Stripe Dashboard |
| 5 | Deploy frontend | Vercel |
| 6 | Set frontend env var | Vercel dashboard |
| 7 | Point backend CORS/APP_URL to frontend | Backend env vars |
| 8 | Test login + Stripe | Browser |

---

## Step 1a: Deploy the backend with Railway (recommended)

Railway runs your Node API; Supabase stays your database. You don’t need Render if you use Railway.

### 1a.1 Create a Railway project

1. Go to **https://railway.app** and sign up or log in (e.g. with GitHub).
2. Click **New Project**.
3. Choose **Deploy from GitHub repo** and select **inventory-app** (connect GitHub if asked).
4. Railway will add a service. Click that service to open its settings.

### 1a.2 Set root directory and build/start

1. In the service, go to **Settings** (or **Variables** → **Settings**).
2. **Root Directory:** set to **`server`** (so Railway runs from the `server` folder).
3. **Build Command:** `npm install && npx prisma generate`  
   (or leave blank; Railway often runs `npm install` by default – then add a custom build that runs `npx prisma generate` if Prisma is required.)
4. **Start Command:** `npm start` (runs `node server.js`).
5. **Watch Paths:** leave default or set `server` so only changes in `server` trigger deploys.

### 1a.3 Add environment variables on Railway

In the service → **Variables** tab (or **Settings** → **Variables**), add:

**Required:**

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Long random string (e.g. run `openssl rand -hex 32` locally). |
| `DATABASE_URL` | Your **Supabase** connection string (same as in `server/.env`). From Supabase: Project Settings → Database → Connection string (URI). Prefer the **pooler** URL (port 6543) if shown. |

**Required for Stripe:**

| Key | Value |
|-----|--------|
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` from Stripe Dashboard. |
| `STRIPE_PRO_PRICE_ID` | Your Pro monthly price ID. |
| `STRIPE_WEBHOOK_SECRET` | Add after Step 2 (production webhook). Leave empty at first. |

**After you have the frontend URL (Step 3):**

| Key | Value |
|-----|--------|
| `CORS_ORIGIN` | `https://your-app.vercel.app` (your Vercel URL). |
| `APP_URL` | Same as `CORS_ORIGIN`. |

**Optional:** `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, `RESEND_API_KEY`, etc.

Save. Railway will redeploy when you change variables (or trigger a deploy manually).

### 1a.4 Get your backend URL

1. In the service, open **Settings** → **Networking** (or **Deployments** → **Generate domain**).
2. Click **Generate domain** (or use the default). You’ll get a URL like `https://inventory-app-api-production.up.railway.app`.
3. Copy this; it’s your **backend URL** for `VITE_API_BASE_URL`, Stripe webhook, and `CORS_ORIGIN` / `APP_URL`.

### 1a.5 Migrations

Your production DB is the same Supabase DB. You already ran migrations locally, so the schema is there. If you add new migrations later, run from your machine (with the same `DATABASE_URL`): `cd server && npx prisma migrate deploy`.

---

## Step 1b: Deploy the backend with Render (alternative)

You only need **one** backend host. If you prefer Render instead of Railway:

1. Go to **https://render.com** → **New** → **Web Service**.
2. Connect **inventory-app** repo.
3. **Root Directory:** **`server`**.
4. **Build Command:** `npm install && npx prisma generate`
5. **Start Command:** `npm start`
6. Add the same **environment variables** as in the table in Step 1a.3 (Render has an **Environment** tab).
7. Deploy and copy the service URL (e.g. `https://inventory-app-api.onrender.com`).

Then continue with Step 2 (Stripe webhook) using that URL.

---

## Step 2: Stripe production webhook

So Stripe can tell your **deployed** backend when a subscription is created/updated/canceled:

1. Go to **https://dashboard.stripe.com**.
2. Turn **off** Test mode (toggle top-right) if you want **live** payments; leave **on** for testing with test cards.
3. **Developers** → **Webhooks** → **Add endpoint**.
4. **Endpoint URL:**  
   `https://YOUR-BACKEND-URL/api/billing/webhook`  
   Use your **Railway** or **Render** backend URL, e.g.  
   `https://inventory-app-api-production.up.railway.app/api/billing/webhook` or  
   `https://inventory-app-api.onrender.com/api/billing/webhook`
5. Click **Select events** and add:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Click **Add endpoint**.
7. On the new endpoint page, click **Reveal** under **Signing secret** and copy the value (starts with `whsec_`).
8. In **Railway** or **Render** → your service → **Variables** / **Environment**, add or update:
   - `STRIPE_WEBHOOK_SECRET` = that `whsec_...` value.
9. Save and **redeploy** the backend so it picks up the new secret.

---

## Step 3: Deploy the frontend (Vercel)

### 3.1 Connect repo and create project

1. Go to **https://vercel.com** and sign in (e.g. with GitHub).
2. **Add New** → **Project**.
3. Import your **inventory-app** repo.
4. **Configure:**
   - **Root Directory:** leave as **`.`** (project root, where `package.json` and `src/` live).
   - **Framework Preset:** Vite (Vercel usually detects it).
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

### 3.2 Set frontend env var

Before or after first deploy:

1. Project → **Settings** → **Environment Variables**.
2. Add:
   - **Name:** `VITE_API_BASE_URL`
   - **Value:** `https://YOUR-BACKEND-URL/api`  
     Example: `https://inventory-app-api.onrender.com/api`  
     No trailing slash.
3. Apply to **Production** (and Preview if you want).
4. **Redeploy** the project (Deployments → ⋮ → Redeploy) so the build uses the new variable.

### 3.3 Get your frontend URL

After deploy, Vercel shows the URL, e.g.:

- `https://inventory-app-xxx.vercel.app`

Copy this.

---

## Step 4: Point backend at frontend

So the API allows the frontend origin and sends users to the right URL after login/Stripe:

1. **Railway** or **Render** → your backend service → **Variables** / **Environment**.
2. Set:
   - `CORS_ORIGIN` = `https://your-actual-vercel-url.vercel.app`
   - `APP_URL` = `https://your-actual-vercel-url.vercel.app`
3. Save and **redeploy** the backend.

---

## Step 5: Test after everything is live

1. Open your **Vercel** URL in the browser.
2. Create an account (Sign up) or use demo if you’ve set it up:
   - Email: `demo@example.com`
   - Password: `demo123`
3. If signup: confirm the app loads after login (e.g. Dashboard, Settings).
4. Go to **Pricing** → **Start Free Trial** (Pro or Starter).
5. Complete Stripe Checkout (use test card `4242 4242 4242 4242` if in Test mode).
6. You should be redirected back; in **Settings** the plan should show Pro or Starter.

If login fails: check backend logs on Railway or Render (Logs tab), and that `DATABASE_URL` and `JWT_SECRET` are set. If Stripe doesn’t update the plan: check that `STRIPE_WEBHOOK_SECRET` matches the **production** webhook and that the webhook URL is your backend URL.

---

## Checklist (summary)

- [ ] Backend deployed on **Railway** or **Render** (root directory: `server`).
- [ ] Backend env: `NODE_ENV`, `JWT_SECRET`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, then `CORS_ORIGIN` and `APP_URL` after frontend is known.
- [ ] Stripe production webhook added (URL = backend `/api/billing/webhook`), secret copied to backend.
- [ ] Frontend deployed on Vercel (root = project root).
- [ ] Frontend env: `VITE_API_BASE_URL` = backend URL + `/api`.
- [ ] Backend `CORS_ORIGIN` and `APP_URL` set to Vercel URL.
- [ ] Test: open Vercel URL → sign up or log in → Pricing → Start Free Trial → pay with test card → confirm plan in Settings.

You can do Steps 1–4 in order, then test once (Step 5). If you hit a specific error (e.g. login, CORS, or webhook), share the message and we can fix that next.
