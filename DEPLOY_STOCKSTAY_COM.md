# How to Deploy Stock Stay at stockstay.com

This guide walks you through getting your landing page (and app) live at **stockstay.com** so people find it when they search "Stock Stay" or "stockstay.com".

---

## Overview

1. **Get the domain** – Register (or transfer) **stockstay.com** at a registrar.
2. **Deploy the app** – Host the frontend (and optionally the backend) on a platform.
3. **Connect the domain** – Point stockstay.com to your deployment.

---

## Step 1: Get the domain stockstay.com

1. Go to a **domain registrar** (e.g. [Namecheap](https://www.namecheap.com), [Google Domains](https://domains.google), [Cloudflare](https://www.cloudflare.com/products/registrar/), [Porkbun](https://porkbun.com)).
2. Search for **stockstay.com**.
3. If it’s available, add it to cart and complete purchase. If it’s taken, you’ll need to choose another name or try to buy it from the owner.
4. After purchase, you’ll manage DNS for stockstay.com in the registrar’s (or Cloudflare’s) dashboard. You’ll use this in Step 3.

---

## Step 2: Deploy the app

You need to host two things:

- **Frontend** (React/Vite) – the landing page and app UI.
- **Backend** (Node/Express) – API and database (if you use it in production).

### Option A: Vercel (frontend) + Railway or Render (backend)

**Frontend on Vercel (good for “landing page at stockstay.com”)**

1. Push your code to **GitHub** (if you haven’t already).
2. Go to [vercel.com](https://vercel.com) → Sign up with GitHub.
3. **New Project** → Import your `inventory-app` repo.
4. Configure:
   - **Framework Preset:** Vite  
   - **Root Directory:** `./` (project root)  
   - **Build Command:** `npm run build`  
   - **Output Directory:** `dist`  
   - **Environment variables:**  
     If your app calls an API, add e.g. `VITE_API_BASE_URL=https://your-api-url.com/api`
5. Deploy. Vercel will give you a URL like `inventory-app-xxx.vercel.app`.
6. You’ll connect **stockstay.com** to this Vercel project in Step 3.

**Backend (optional, for login/API)**

- Use your existing [Railway](https://railway.app) or [Render](https://render.com) setup (see `CLOUD_DEPLOYMENT.md`).
- Set `VITE_API_BASE_URL` in Vercel to your backend API URL.

### Option B: Netlify (frontend + optional backend)

1. Go to [netlify.com](https://netlify.com) → Sign up with GitHub.
2. **Add new site** → **Import from Git** → choose your repo.
3. Settings:
   - **Build command:** `npm run build`  
   - **Publish directory:** `dist`  
   - Add `VITE_API_BASE_URL` if you use an API.
4. Deploy. You’ll get a URL like `something.netlify.app`; you’ll point stockstay.com to it in Step 3.

### Option C: Single server (VPS)

- Build: `npm run build`.
- Serve the `dist` folder with Nginx (or another server) and point stockstay.com to this server’s IP (see your host’s docs).

---

## Step 3: Point stockstay.com to your deployment

After the app is deployed, you have a **host URL** (e.g. `inventory-app-xxx.vercel.app` or `something.netlify.app`).

### If you used Vercel

1. In Vercel: Project → **Settings** → **Domains**.
2. Add **stockstay.com** and **www.stockstay.com**.
3. Vercel will show you the DNS records to add (usually an **A** record or **CNAME**).
4. In your **domain registrar** (or DNS provider):
   - Add the **A** record: name `@`, value the IP Vercel gives you, **or**
   - Add the **CNAME** record: name `@` (if supported) or `www`, value `cname.vercel-dns.com` (Vercel will show the exact target).
5. Wait 5–60 minutes for DNS to propagate. Vercel will issue SSL for stockstay.com automatically.

### If you used Netlify

1. In Netlify: Site → **Domain management** → **Add custom domain** → **stockstay.com** (and **www.stockstay.com**).
2. Netlify will show required DNS records (e.g. A record to Netlify’s load balancer or CNAME to `xxx.netlify.app`).
3. In your **registrar/DNS**:
   - Add the A or CNAME record Netlify specifies for **stockstay.com** (and **www** if you want).
4. After DNS propagates, Netlify will provision HTTPS for stockstay.com.

### DNS at the registrar

- Log in where you bought **stockstay.com** (Namecheap, Cloudflare, Google, etc.).
- Open **DNS** / **Manage DNS** for stockstay.com.
- Add the A or CNAME records your host (Vercel/Netlify) tells you.  
  Typical examples:
  - **A:** `@` → `76.76.21.21` (Vercel) or the IP Netlify gives.
  - **CNAME:** `www` → `cname.vercel-dns.com` or `xxx.netlify.app`.

---

## Step 4: Confirm everything

1. Visit **https://stockstay.com** – you should see your Stock Stay landing page.
2. Visit **https://www.stockstay.com** if you set it up – it should work or redirect to stockstay.com (depending on host settings).
3. Your `index.html` already has:
   - Title and meta description with “Stock Stay” and “stockstay.com”
   - Canonical URL `https://stockstay.com/`
   - Open Graph and structured data

So once the site is live at stockstay.com, search engines can associate the landing page with “Stock Stay” and “stockstay.com”. It can take a few days for Google to index and show it for “stockstay” searches.

---

## Quick reference

| Step | Action |
|------|--------|
| 1 | Register **stockstay.com** at a registrar. |
| 2 | Deploy frontend (e.g. Vercel or Netlify) and backend if needed. |
| 3 | In registrar DNS, add A/CNAME for stockstay.com (and www) to your host. |
| 4 | Open https://stockstay.com and verify the landing page. |

If you tell me which you prefer (e.g. “Vercel + Namecheap” or “Netlify + Cloudflare”), I can give you exact DNS values and clicks for that combo.
