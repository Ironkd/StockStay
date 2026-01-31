# 502 / "Application failed to respond" on Railway – what to check

A 502 or "Application failed to respond" usually means Railway’s proxy didn’t get a valid response from your app. Do these in order.

## 0. Root Directory (most common fix)

This repo has **two apps**: the **frontend** (root folder, Vite/React) and the **backend** (inside `server/`). Railway must run the **backend**.

1. In **Railway** → your **StockStay** service → **Settings**.
2. Find **"Root Directory"** (or **"Source"** / **"Monorepo"**).
3. Set it to **`server`** (the folder that contains `server.js` and `package.json` with `"start": "node server.js"`).
4. Save and **redeploy**.

If Root Directory is empty or wrong, Railway builds/runs the root folder (the frontend). The root `package.json` has no `start` script, so nothing listens on PORT and you get "Application failed to respond". Setting Root Directory to **server** fixes this.

## 1. Check Railway logs

1. In **Railway** → your **StockStay** service → **Deployments**.
2. Open the **latest deployment** → **View Logs** (or **Logs** tab).
3. Look for:
   - **"Server running on http://0.0.0.0:..."** – app started; 502 might be timeout or a later crash.
   - **Red errors** – e.g. `DATABASE_URL must be a PostgreSQL URL`, `Cannot find module`, Prisma/connection errors → fix that first.
   - **No “Server running”** – app is crashing on startup (often missing or invalid env).

## 2. Test the health endpoint

In a **new browser tab** open:

```
https://stockstay-production.up.railway.app/api/health
```

- **200 + `{"status":"ok"}`** – app is up; 502 may be only for signup/preflight (see step 3).
- **502 / “can’t connect”** – app isn’t responding. Check step 1; common causes:
  - **DATABASE_URL** missing or wrong on Railway.
  - **JWT_SECRET** missing in production (app exits if `NODE_ENV=production` and no JWT_SECRET).
  - Build or start script failing (see **Deployments** → build logs).

## 3. Required env vars on Railway

In **Railway** → your service → **Variables**, ensure you have at least:

| Variable       | Required | Notes |
|----------------|----------|--------|
| `DATABASE_URL` | Yes      | PostgreSQL URL (e.g. Supabase). App won’t start without it. |
| `JWT_SECRET`   | Yes (prod) | Required when `NODE_ENV=production`. |
| `PORT`         | Set by Railway | Don’t override unless you know why. |
| `CORS_ORIGIN`  | Recommended | Your frontend origin(s), comma-separated. |

After changing variables, **redeploy** (new deployment) so the new values are used.

## 4. Redeploy after code changes

If you changed the OPTIONS handler or other server code:

- **Git deploy:** push to the branch Railway watches; wait for the new deployment to finish.
- **Manual:** trigger a **Redeploy** from the latest deployment in Railway.

Then try signup again and, if 502 persists, check logs again during the next signup attempt.
