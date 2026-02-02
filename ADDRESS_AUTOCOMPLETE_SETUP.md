# Address autocomplete setup (step by step)

Address autocomplete uses **Google Places API**. Follow these steps to enable it.

---

## Step 1: Open Google Cloud Console

1. Go to **https://console.cloud.google.com/**
2. Sign in with your Google account.

---

## Step 2: Create or select a project

1. At the top of the page, click the **project dropdown** (it may say "Select a project" or show a project name).
2. Click **"New Project"**.
3. Enter a name (e.g. **Stock Stay**).
4. Click **Create**.
5. Wait for the project to be created, then **select it** from the dropdown so it’s the active project.

---

## Step 3: Enable the required APIs

1. In the left sidebar, go to **"APIs & Services"** → **"Library"** (or open **https://console.cloud.google.com/apis/library**).
2. Search for **"Places API"**.
3. Click **Places API** → click **Enable**.
4. Go back to **Library** and search for **"Maps JavaScript API"**.
5. Click **Maps JavaScript API** → click **Enable**.

---

## Step 4: Create an API key

1. In the left sidebar, go to **"APIs & Services"** → **"Credentials"** (or **https://console.cloud.google.com/apis/credentials**).
2. Click **"+ Create credentials"** at the top.
3. Choose **"API key"**.
4. Your key will be created. You can:
   - **Copy** the key now (you’ll add it in Step 5).
   - Optionally click **"Restrict key"** to limit it (e.g. by HTTP referrer for your domains). For local dev you can skip restriction at first.

---

## Step 5: Add the key to your app (local)

1. In your project **root** (same folder as `package.json`), open or create **`.env`** (or **`.env.local`**).
2. Add this line (replace with your actual key):

   ```
   VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
   ```

3. Save the file.
4. **Restart your dev server** (stop `npm run dev` and run it again) so Vite picks up the new variable.

---

## Step 6: Test it

1. Run the app: `npm run dev`.
2. Go to **Sign up** (or **Settings** → Profile, or **Clients** → Add client).
3. You should see a **"Search address"** field above the address inputs.
4. Type part of an address (e.g. **123 Main** or a city name).
5. When suggestions appear, click one. Street, city, province, and postal code should fill in.

If the "Search address" field does **not** appear, the key is not set or not loaded. Check that:
- The variable name is exactly **VITE_GOOGLE_MAPS_API_KEY**.
- The file is in the **root** of the project (where `package.json` is).
- You restarted the dev server after adding it.

---

## Step 7: Production (e.g. Vercel / Railway)

When you deploy:

1. In your **hosting** dashboard (Vercel, Netlify, etc.), open **Environment variables** / **Variables**.
2. Add:

   - **Name:** `VITE_GOOGLE_MAPS_API_KEY`
   - **Value:** your same API key (or a separate key for production).

3. Redeploy so the new variable is used.

**Optional:** In Google Cloud Console → Credentials → your API key → **Application restrictions**, add your production domain(s) (e.g. `https://stockstay.com/*`) so the key only works on your site.

---

## Quick checklist

- [ ] Google Cloud project created/selected  
- [ ] **Places API** enabled  
- [ ] **Maps JavaScript API** enabled  
- [ ] API key created and copied  
- [ ] `VITE_GOOGLE_MAPS_API_KEY=...` in root `.env` or `.env.local`  
- [ ] Dev server restarted  
- [ ] "Search address" appears and fills fields when you pick a suggestion  
- [ ] (Production) Same variable set in hosting and app redeployed  

---

## If something goes wrong

- **"Search address" never appears**  
  Key not loaded. Confirm variable name, file location, and restart.

- **Suggestions don’t show or you see a console error**  
  Check that both **Places API** and **Maps JavaScript API** are enabled and that the key is not restricted in a way that blocks your URL.

- **Billing:** Google Cloud has a free tier. For light use, address autocomplete often stays within it. You may need to enable billing on the project; check **Billing** in the Cloud Console.
