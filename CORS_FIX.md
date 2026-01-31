# Fix: "Load failed" on signup (CORS)

When you see:
**"Load failed. Request URL: https://stockstay-production.up.railway.app/api/auth/signup. Check VITE_API_BASE_URL and CORS"**

the frontend is calling your Railway backend, but the **backend is not allowing your frontend’s origin**. Fix it on the **backend (Railway)**.

## 0. Still getting the error? Find the exact origin

1. Open your app in the browser (the page where you click Sign up).
2. Open DevTools (F12) → **Console** tab.
3. Paste and run:
   ```js
   fetch('https://stockstay-production.up.railway.app/api/cors-check').then(r=>r.json()).then(d=>console.log('Add this to CORS_ORIGIN:', d.origin))
   ```
4. If it succeeds, the console will show **"Add this to CORS_ORIGIN: https://..."** — copy that exact value into Railway's `CORS_ORIGIN` (comma-separated with any others), save, **redeploy** the backend, then try signup again.
5. If the fetch **fails** (CORS/network error), the origin isn't allowed yet. Use your **address bar**: if the URL is `https://www.stockstay.com/login`, the origin is `https://www.stockstay.com`. Add that exact string to `CORS_ORIGIN` on Railway, save, redeploy.

**Quick test:** In Railway, temporarily **delete** the `CORS_ORIGIN` variable and redeploy. Try signup again. If it works, the issue is the origin list — add back `CORS_ORIGIN` with the exact origin from your address bar (e.g. `https://www.stockstay.com` or `https://stock-stay.vercel.app`).

## 1. Set CORS on Railway (backend)

1. Open your **Railway** project → select the **backend** service.
2. Go to **Variables** (or **Settings** → **Environment**).
3. Add or edit:
   - **Name:** `CORS_ORIGIN`
   - **Value:** the **exact** URL where the frontend runs (no trailing slash).

Examples:

- Frontend on **Vercel:**  
  `https://your-app-name.vercel.app`
- Frontend on **custom domain:**  
  `https://stockstay.com` or `https://app.stockstay.com`
- Testing **locally** (Vite default):  
  `http://localhost:5173`

4. **Multiple origins** (e.g. local + production): comma-separated, no spaces:
   ```
   http://localhost:5173,https://your-app.vercel.app
   ```
5. Save and let Railway **redeploy** the backend (or trigger a redeploy).

## 2. Confirm frontend API URL

Your frontend must call the Railway API:

- **Local dev:** In the **project root** `.env` (or `.env.local`):
  ```
  VITE_API_BASE_URL=https://stockstay-production.up.railway.app/api
  ```
- **Deployed (e.g. Vercel):** In the hosting dashboard, set the **same** env var for the frontend build, then **rebuild/redeploy** the frontend.

After CORS_ORIGIN includes your frontend origin and the backend has redeployed, try signup again.
