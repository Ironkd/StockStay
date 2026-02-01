# Deploy Stock Stay (Step-by-Step)

Use this guide to deploy the **backend** and **frontend** to the cloud. You already use **Supabase** for the database, so we only deploy the API server and the React app.

---

## Prerequisites

- Code pushed to **GitHub** (e.g. `inventory-app` repo)
- **Supabase** project with database URL (you already have this)
- Accounts: **Railway** (or Render) for backend, **Vercel** for frontend (free tiers are enough)

---

## Part 1: Deploy the backend (Railway)

1. Go to [railway.app](https://railway.app) and sign in with GitHub.

2. **New Project** → **Deploy from GitHub repo** → select your `inventory-app` repo.

3. **Root directory**: set to `server` (so Railway runs the Node API, not the frontend).
   - In the service → **Settings** → **Root Directory** → `server`.

4. **Build & start** (Railway usually detects Node; if not, set manually):
   - **Build Command:** `npm install --omit=dev && npm run build`  
     (uses `--omit=dev` to avoid the deprecated production config warning; runs `prisma generate` so the DB client is ready)
   - **Start Command:** `npm start`  
     (runs `node server.js`)

5. **Variables** (Railway → your service → **Variables**):

   | Variable        | Value |
   |-----------------|--------|
   | `NODE_ENV`      | `production` |
   | `PORT`          | `3000` (Railway may set this automatically) |
   | `JWT_SECRET`    | A long random string (e.g. from `openssl rand -base64 32`) |
   | `DATABASE_URL`  | Your **Supabase** connection string (Settings → Database → Connection string → URI). Use the **connection pooling** URL if Supabase shows one (e.g. port 6543). |

   Leave **CORS_ORIGIN** empty for now; you’ll set it after the frontend is deployed.

6. **Deploy** – Railway will build and start the server. Open the generated URL (e.g. `https://your-app.up.railway.app`) and check:
   - `https://your-app.up.railway.app/api` – you may see 404 or a simple response; that’s fine as long as the server is up.

7. **Note the backend URL** – e.g. `https://inventory-app-api.up.railway.app`. You’ll use this for the frontend and CORS.

---

## Part 2: Deploy the frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.

2. **Add New** → **Project** → import your `inventory-app` repo.

3. **Root Directory**: leave as **root** (the repo root, where `package.json` and `vite.config.ts` are).

4. **Build settings** (Vercel usually detects Vite; confirm):
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

5. **Environment variable** (critical for production):
   - **Key:** `VITE_API_BASE_URL`
   - **Value:** `https://YOUR-BACKEND-URL/api`  
     Replace `YOUR-BACKEND-URL` with your Railway backend URL (no trailing slash), e.g.  
     `https://inventory-app-api.up.railway.app/api`

6. **Deploy** – Vercel will build and give you a URL like `https://inventory-app-xxx.vercel.app`.

7. **Test** – Open the Vercel URL, go to Login, and sign in. If the app loads but API calls fail, check the browser console and that `VITE_API_BASE_URL` is set correctly (it’s baked in at build time).

---

## Part 3: Set CORS on the backend

So the browser allows requests from your Vercel URL:

1. In **Railway** → your backend service → **Variables**:
   - Add: **`CORS_ORIGIN`** = `https://your-app-xxx.vercel.app`  
     (your exact Vercel URL, no trailing slash)

2. Redeploy the backend (or trigger a redeploy) so the new variable is applied.

3. Try logging in again from the Vercel frontend; CORS errors should be gone.

---

## Part 4: Database migrations (if needed)

If your Supabase database schema is already up to date (you ran migrations locally against Supabase), you’re done. If you ever add new Prisma migrations:

1. **Option A – Run locally against production DB (one-time):**
   - Set `DATABASE_URL` in `server/.env` to your Supabase URL.
   - In `server/`: `npx prisma migrate deploy`

2. **Option B – Railway build:**  
   You can add `npx prisma migrate deploy` to the Railway build command (e.g. `npm install --omit=dev && npm run build && npx prisma migrate deploy`). Only do this if you want every deploy to apply pending migrations.

---

## Summary: URLs and env vars

| Where        | What to set |
|-------------|-------------|
| **Railway (backend)** | `NODE_ENV=production`, `JWT_SECRET`, `DATABASE_URL` (Supabase), `CORS_ORIGIN` (Vercel URL) |
| **Vercel (frontend)** | `VITE_API_BASE_URL` = `https://YOUR-RAILWAY-URL/api` |

After this, your app is live: frontend on Vercel, API on Railway, database on Supabase.

---

## Optional: Custom domain

- **Vercel:** Project → Settings → Domains → add your domain (e.g. `app.stockstay.com`).
- **Railway:** Service → Settings → Domains → add a domain for the API (e.g. `api.stockstay.com`).
- Then set **CORS_ORIGIN** to your frontend domain and **VITE_API_BASE_URL** to your API domain (e.g. `https://api.stockstay.com/api`), and rebuild/redeploy both.

---

## Alternative: Render instead of Railway

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect the same GitHub repo.
3. **Root Directory:** `server`.
4. **Build Command:** `npm install --omit=dev && npm run build`
5. **Start Command:** `npm start`
6. Add the same **Environment Variables** as in Part 1 (including `DATABASE_URL` from Supabase).
7. After frontend is on Vercel, add **CORS_ORIGIN** and redeploy.

Render will give you a URL like `https://inventory-app-xxxx.onrender.com`; use that as the backend URL for Vercel and CORS.
