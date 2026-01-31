# Deploy Walkthrough – Do This In Order

You do these steps in your browser (Railway + Vercel). The app can’t do them for you, but follow this and you’ll be live.

**Before you start:** Have your **Supabase** project open (you need the database URL).

---

## Part A: Get your secrets ready

Do this once, then copy-paste into Railway and Vercel.

### 1. JWT secret (for Railway)

In Terminal run:

```bash
openssl rand -base64 32
```

Copy the output (e.g. `K7x9mN2pQ...`). You’ll paste this as `JWT_SECRET` in Railway.

### 2. Database URL (for Railway)

1. Go to [supabase.com](https://supabase.com) → your project.
2. **Settings** (gear) → **Database**.
3. Under **Connection string**, choose **URI**.
4. Copy the URI. It looks like:  
   `postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres`
5. Replace `[YOUR-PASSWORD]` with your actual database password (the one you set when you created the project).
6. Save this somewhere – you’ll paste it as `DATABASE_URL` in Railway.

---

## Part B: Deploy backend (Railway)

1. Go to **[railway.app](https://railway.app)** → **Login** → **Sign in with GitHub** (use the account that owns **Ironkd/StockStay**).

2. **New Project** → **Deploy from GitHub repo**.

3. If asked, **Configure GitHub App** and allow Railway to see your repos. Then pick **StockStay** (or Ironkd/StockStay) and **Deploy now**.

4. After the service appears, click the **service** (the box/card), then:
   - **Settings** (or the gear).
   - Find **Root Directory** (or **Source**). Set it to: `server`  
     (so Railway builds the Node API, not the frontend).
   - **Save** if there’s a save button.

5. **Variables** (tab or **Variables** in the sidebar):
   - Click **New Variable** or **Add variable** and add these one by one:

   | Name           | Value |
   |----------------|--------|
   | `NODE_ENV`     | `production` |
   | `JWT_SECRET`   | *(paste the output of `openssl rand -base64 32`)* |
   | `DATABASE_URL` | *(paste your Supabase connection URI from Part A.2)* |

   - Do **not** add `CORS_ORIGIN` yet. You’ll add it after the frontend is deployed.

6. **Build & start** (often under **Settings**):
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`  
   Save if needed.

7. **Deploy:** Railway usually deploys automatically. If not, click **Deploy** / **Redeploy**. Wait until the build is green/done.

8. **Get your backend URL:**
   - **Settings** → **Networking** or **Generate domain** → **Generate domain**.  
   - Copy the URL (e.g. `https://stockstay-production-xxxx.up.railway.app`).  
   - You’ll use this in Part C and Part D. No trailing slash.

---

## Part C: Deploy frontend (Vercel)

1. Go to **[vercel.com](https://vercel.com)** → **Sign up** / **Log in** → **Continue with GitHub**.

2. **Add New…** → **Project**.

3. **Import** the **StockStay** repo (from Ironkd). Click **Import**.

4. **Configure Project:**
   - **Root Directory:** leave as **.** (root). Don’t set it to `server`.
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Environment Variables:** click **Add** (or expand Environment Variables):
     - **Name:** `VITE_API_BASE_URL`
     - **Value:** `https://YOUR-RAILWAY-URL/api`  
       Replace `YOUR-RAILWAY-URL` with the URL from Part B step 8 (e.g. `https://stockstay-production-xxxx.up.railway.app/api`).

5. Click **Deploy**. Wait until the build finishes.

6. **Your frontend URL:** Vercel will show something like `https://stockstay-xxx.vercel.app`. Copy this exact URL (no trailing slash) – you’ll use it in Part D.

---

## Part D: Fix CORS (backend)

So the browser allows your frontend to call the backend:

1. Go back to **Railway** → your backend service → **Variables**.

2. **New Variable:**
   - **Name:** `CORS_ORIGIN`
   - **Value:** your **Vercel** URL from Part C step 6 (e.g. `https://stockstay-xxx.vercel.app`). No trailing slash.

3. **Redeploy** the backend (Railway often redeploys when you change variables; if not, use **Redeploy** in the menu).

4. Open your **Vercel** URL in a browser → **Login** → sign in. It should work without CORS errors.

---

## Done

- **Frontend:** your Vercel URL (e.g. `https://stockstay-xxx.vercel.app`)
- **Backend:** your Railway URL (e.g. `https://stockstay-production-xxxx.up.railway.app`)
- **Database:** Supabase (unchanged)

If login fails, check: (1) `VITE_API_BASE_URL` on Vercel is exactly `https://YOUR-RAILWAY-URL/api`, (2) `CORS_ORIGIN` on Railway is exactly your Vercel URL, (3) `DATABASE_URL` and `JWT_SECRET` are set correctly on Railway.
