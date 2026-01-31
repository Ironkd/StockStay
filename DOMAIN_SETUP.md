# Custom Domains: stockstay.com & stockstay.ca — Step-by-Step

This guide walks you through connecting **stockstay.com** and **stockstay.ca** to your app (on Vercel) and **api.stockstay.com** to your API (on Railway), with detailed steps and explanations.

---

## What We’re Doing (In Plain English)

- **stockstay.com**, **www.stockstay.com**, and **stockstay.ca** → show your React app (hosted on Vercel).
- **api.stockstay.com** → points to your Node API (hosted on Railway).
- **DNS** = the internet’s “phone book”: when someone types `stockstay.com`, their browser looks up where that domain lives. We’ll add records so the domains point to Vercel and Railway.
- **Environment variables** = we’ll tell the app to use `https://api.stockstay.com/api` instead of the Railway default URL, and tell the API to accept requests from your custom domains (CORS).

You’ll do work in four places: **Vercel**, **Railway**, **your DNS provider**, and **env vars**. Do them in order.

---

## Before You Start: Where Is Your DNS?

You need to add DNS records where **stockstay.com** and **stockstay.ca** are managed. That’s usually one of:

- **Where you bought the domain** (e.g. Namecheap, GoDaddy, Google Domains, Cloudflare Registrar).
- **Where the domain’s nameservers point** (e.g. you bought it at Namecheap but changed nameservers to Cloudflare — then DNS is in **Cloudflare**).

To check: log in to the place where you registered stockstay.com. Look for **DNS**, **DNS Settings**, **Manage DNS**, or **Nameservers**. That’s where you’ll add the records in Step 3. Have that tab open and ready.

---

# STEP 1: Add Your Domains in Vercel (Frontend)

**Goal:** Tell Vercel “when someone visits stockstay.com, www.stockstay.com, or stockstay.ca, serve my Stock Stay app.”

---

### 1.1 Open Your Project in Vercel

1. Go to **[vercel.com](https://vercel.com)** in your browser.
2. Log in (e.g. with GitHub).
3. On the dashboard you’ll see your projects. Click the project that is your **Stock Stay** frontend (the one you deployed from the StockStay repo).
4. You’re now on the project overview (you might see Deployments, Analytics, etc.).

---

### 1.2 Open the Domains Settings

1. At the top of the project page, click the **Settings** tab (or **Project Settings**).
2. In the left sidebar, find **Domains** and click it.
3. You’ll see a list of domains (maybe only the default `something.vercel.app`) and an input or button to add a domain.

---

### 1.3 Add stockstay.com

1. In the “Add domain” or “Domain” field, type exactly: **stockstay.com** (no `https://`, no `www`).
2. Click **Add** (or **Add domain**, **Verify**, etc.).
3. Vercel will try to verify the domain. It will **fail** at first because DNS isn’t set yet — that’s expected.
4. On the same row as **stockstay.com**, Vercel will show what you need to do. Usually it says something like:
   - **Configure your DNS:** Add the following record at your DNS provider.
   - You’ll see either:
     - **A record:** Name `@` (or leave blank), Value **76.76.21.21** (or another IP Vercel shows), **or**
     - **CNAME record:** Name `@`, Value **cname.vercel-dns.com** (if your DNS host allows CNAME on the root).
5. **Write this down or keep the Vercel tab open.** You’ll add this record in Step 3. The exact value (IP or hostname) is what Vercel shows — use that, not necessarily the example above.

---

### 1.4 Add www.stockstay.com

1. Again in the “Add domain” area, type: **www.stockstay.com**.
2. Click **Add**.
3. Vercel will show a **CNAME** record:
   - **Name / Host:** `www` (or `www.stockstay.com` depending on the provider — often just `www`).
   - **Value / Target / Points to:** **cname.vercel-dns.com**
4. Note this for Step 3.

---

### 1.5 Add stockstay.ca

1. In “Add domain”, type: **stockstay.ca**.
2. Click **Add**.
3. Vercel will show the same kind of instructions as for stockstay.com (A record or CNAME for the root of stockstay.ca). Note the **Name** and **Value** it gives you.
4. If you also want **www.stockstay.ca**, add **www.stockstay.ca** the same way as www.stockstay.com; the target will again be **cname.vercel-dns.com**.

You’re done with Vercel domains for now. Leave the Domains page open so you can double-check the values when you add DNS.

---

# STEP 2: Add the API Domain in Railway (Backend)

**Goal:** Tell Railway “when someone visits api.stockstay.com, that’s my backend.”

---

### 2.1 Open Your Service in Railway

1. Go to **[railway.app](https://railway.app)** and log in.
2. Open the project that contains your **StockStay** backend service.
3. Click the **StockStay** service (the one that runs `node server.js` and is at `stockstay-production.up.railway.app`).

---

### 2.2 Open Networking / Domains

1. Click the **Settings** tab (or the gear icon) for that service.
2. In the sidebar or page, find **Networking**, **Domains**, or **Public Networking**.
3. Click it. You’ll see the service’s current public URL (e.g. `stockstay-production.up.railway.app`) and an option to add a **Custom Domain**.

---

### 2.3 Add api.stockstay.com

1. In the “Custom domain” or “Domain” field, type: **api.stockstay.com** (no `https://`).
2. Click **Add** (or **Save**, **Add domain**).
3. Railway will show a message like “Add a CNAME record at your DNS provider” and give you a **target hostname**, e.g. **stockstay-production.up.railway.app** (or something like `stockstay-production.up.railway.app`).
4. **Copy or write down:**
   - **Domain you added:** api.stockstay.com  
   - **CNAME target:** the hostname Railway shows (e.g. stockstay-production.up.railway.app).

You’ll add this CNAME in Step 3. Don’t close Railway; you’ll need the Variables tab in Step 4.

---

# STEP 3: Add DNS Records (At Your DNS Provider)

**Goal:** Point stockstay.com, www.stockstay.com, stockstay.ca, and api.stockstay.com to the right places.

**Where:** The place where you manage DNS for stockstay.com and stockstay.ca (see “Before You Start” above). Log in there and find **DNS**, **DNS Management**, **Manage DNS**, or **Records**.

---

### 3.1 Records for stockstay.com

You need the **exact** values Vercel showed you in Step 1.3. Use these as a template; replace with what Vercel displays if it’s different.

**Option A — A record (most common for root domain):**

| Field       | What to enter                          |
|------------|----------------------------------------|
| Type       | **A**                                  |
| Name/Host  | **@** (or leave blank, or “stockstay.com” — depends on provider) |
| Value/Answer/Target | **76.76.21.21** (or the IP Vercel gave you) |
| TTL        | 300 or “Auto” (default is fine)        |

**Option B — CNAME (if your provider allows CNAME on root, e.g. Cloudflare):**

| Field       | What to enter                |
|------------|------------------------------|
| Type       | **CNAME**                    |
| Name/Host  | **@** (or blank)             |
| Value/Target | **cname.vercel-dns.com**   |
| TTL        | 300 or Auto                  |

Add one record (A or CNAME as Vercel instructed). Save.

---

### 3.2 Record for www.stockstay.com

| Field       | What to enter                |
|------------|------------------------------|
| Type       | **CNAME**                    |
| Name/Host  | **www**                      |
| Value/Target | **cname.vercel-dns.com**   |
| TTL        | 300 or Auto                  |

Save.

---

### 3.3 Records for stockstay.ca

Do the same as for stockstay.com, but for the **stockstay.ca** zone (if your provider has separate “zones” per domain):

- **Root (stockstay.ca):** A record to **76.76.21.21** (or the IP Vercel shows for stockstay.ca), or CNAME to **cname.vercel-dns.com** if allowed.
- **www.stockstay.ca** (optional): CNAME **www** → **cname.vercel-dns.com**.

Use the exact values Vercel shows for stockstay.ca if they differ.

---

### 3.4 Record for api.stockstay.com

This points the API subdomain to Railway. Add this in the **stockstay.com** DNS zone (api is a subdomain of stockstay.com).

| Field       | What to enter                                      |
|------------|----------------------------------------------------|
| Type       | **CNAME**                                          |
| Name/Host  | **api**                                            |
| Value/Target | **stockstay-production.up.railway.app** (or the hostname Railway gave you) |
| TTL        | 300 or Auto                                        |

Save.

**Important:** No `https://` in the target — only the hostname (e.g. stockstay-production.up.railway.app). Some providers add a trailing dot; that’s fine.

---

### 3.5 Wait for DNS to Propagate

After saving, DNS can take from a few minutes up to 24–48 hours to update worldwide. Vercel and Railway will keep checking. You can refresh the domain status in Vercel (Step 1) and Railway (Step 2); when they show “Valid” or “Active”, you’re good.

---

# STEP 4: Update Environment Variables

**Goal:** Make the app call api.stockstay.com, and make the API accept requests from stockstay.com and stockstay.ca.

---

### 4.1 Vercel — Point the Frontend to Your API

1. In **Vercel**, open your **Stock Stay** project.
2. Go to **Settings** → **Environment Variables**.
3. Find **VITE_API_BASE_URL**. If it exists, click **Edit**. If not, click **Add New**.
4. Set:
   - **Key:** **VITE_API_BASE_URL**
   - **Value:** **https://api.stockstay.com/api**  
     (Exactly that: `https://`, then `api.stockstay.com`, then `/api`, no trailing slash.)
5. For **Environment**, select **Production** (and optionally Preview if you want preview deployments to use it too).
6. Save (e.g. **Save** or **Add**).

**Why:** The frontend is built with Vite. Vite bakes `VITE_API_BASE_URL` into the JavaScript at **build time**. So we need this set and then a new deploy so the built app uses api.stockstay.com.

---

### 4.2 Redeploy the Vercel Project

1. Go to the **Deployments** tab of your Stock Stay project.
2. Find the latest deployment, click the **⋮** (three dots), and choose **Redeploy** (or use **Redeploy** from the top).
3. Confirm. Wait for the new deployment to finish. That build will use **https://api.stockstay.com/api**.

---

### 4.3 Railway — Allow Your Custom Domains (CORS)

1. In **Railway**, open your **StockStay** backend service.
2. Go to the **Variables** tab.
3. Find **CORS_ORIGIN**. If it exists, click to edit. If not, add a new variable.
4. Set:
   - **Name:** **CORS_ORIGIN**
   - **Value:**  
     **https://stockstay.com,https://www.stockstay.com,https://stockstay.ca**  
     (Comma-separated, no spaces. If you didn’t add stockstay.ca in Vercel, you can use:  
     **https://stockstay.com,https://www.stockstay.com**)
5. Save.

**Why:** Browsers send an `Origin` header (e.g. `https://stockstay.com`). The API only accepts requests from origins you list in CORS_ORIGIN. Listing your custom domains lets the app on stockstay.com and stockstay.ca call the API.

---

### 4.4 Redeploy Railway (If Needed)

Railway often redeploys automatically when you change variables. If not, go to **Deployments**, open the **⋮** on the latest deployment, and choose **Redeploy**.

---

# STEP 5: Verify Everything

1. **DNS:** In Vercel (Domains) and Railway (Networking/Domains), check that each domain shows as **Valid**, **Active**, or **Verified**.
2. **Frontend:** Open **https://stockstay.com** (and **https://www.stockstay.com**, **https://stockstay.ca**) in your browser. You should see your Stock Stay app.
3. **Login:** Try logging in. The app should call **https://api.stockstay.com/api** and succeed. If you see a CORS error, double-check CORS_ORIGIN on Railway and that you redeployed.
4. **API directly:** Open **https://api.stockstay.com/api/health** in the browser. You should see something like: `{"status":"ok","message":"Server is running"}`.

---

# Optional: Redirect stockstay.ca to stockstay.com

If you want **stockstay.ca** to always send users to **stockstay.com**:

- **In Vercel:** Add **stockstay.ca** as a domain (you did this in Step 1). In the domain’s settings, look for **Redirect** and set it to **https://stockstay.com** (permanent redirect 308 or 301).
- **Or** at your DNS provider, if they offer “URL redirect” or “forwarding”, set stockstay.ca → https://stockstay.com.

Otherwise, both domains can serve the same app; CORS is already set for both.

---

# Summary Checklist

- [ ] **Step 1:** Vercel → Domains → added stockstay.com, www.stockstay.com, stockstay.ca (noted DNS instructions).
- [ ] **Step 2:** Railway → Settings → Networking → added api.stockstay.com (noted CNAME target).
- [ ] **Step 3:** DNS provider → added A/CNAME for stockstay.com, CNAME www → Vercel; A/CNAME for stockstay.ca; CNAME api → Railway.
- [ ] **Step 4:** Vercel → VITE_API_BASE_URL = https://api.stockstay.com/api → Redeploy. Railway → CORS_ORIGIN = https://stockstay.com,https://www.stockstay.com,https://stockstay.ca → Redeploy if needed.
- [ ] **Step 5:** Check DNS status, open https://stockstay.com and https://api.stockstay.com/api/health, test login.

After that, your app is live on **stockstay.com** and **stockstay.ca**, and the API on **api.stockstay.com**.
