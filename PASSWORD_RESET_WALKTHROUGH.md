# Password Reset — Detailed Step-by-Step Walkthrough

Follow these steps in order to get real password reset working (forgot password → email → reset link → new password).

---

## What You’ll Do

1. **Run the database migration** so the backend has a `PasswordResetToken` table.
2. **Install the server dependency** (Resend) in the `server` folder.
3. **Create a Resend account** and get an API key so the server can send email.
4. **Set environment variables** on Railway (APP_URL, RESEND_API_KEY, optional RESEND_FROM_EMAIL).
5. **Deploy** the latest code to Railway (and Vercel if needed).
6. **Test** the full flow: forgot password → email → reset link → new password → login.

---

# PART A: Run the Database Migration

**Goal:** Create the `PasswordResetToken` table in your Supabase database so the backend can store reset tokens.

---

### A.1 Open Terminal and Go to the Server Folder

1. Open **Terminal** (or Cursor’s integrated terminal).
2. Go to your project and into the **server** folder:
   ```bash
   cd /Users/davidkirwan/inventory-app/server
   ```

---

### A.2 Make Sure DATABASE_URL Is Set

The migration uses your **Supabase** connection string.

- **If you have `server/.env`:** Open `server/.env` and confirm there is a line like:
  ```bash
  DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres
  ```
  (Your actual URL will be different; the important thing is it points to your Supabase project.)

- **If you don’t have `server/.env`:** Copy from the example and fill in your Supabase URL:
  ```bash
  cp .env.example .env
  ```
  Then edit `.env` and set **DATABASE_URL** to your Supabase connection URI (from Supabase → Settings → Database → Connection string → URI). Replace `[YOUR-PASSWORD]` with your database password.

---

### A.3 Run the Migration

1. In the same terminal (still in `server`), run:
   ```bash
   npx prisma migrate deploy
   ```
2. You should see output like:
   - `Applying migration ... 20260131000001_add_password_reset_token`
   - `The following migration(s) have been applied: ...`
3. If you see an error like “Migration not found” or “PENDING”, run:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```
4. When it finishes without errors, the **PasswordResetToken** table exists in your database. You’re done with Part A.

---

# PART B: Install the Server Dependency (Resend)

**Goal:** Install the `resend` package so the backend can send email.

---

### B.1 Install in the Server Folder

1. In Terminal, make sure you’re in the **server** folder:
   ```bash
   cd /Users/davidkirwan/inventory-app/server
   ```
2. Run:
   ```bash
   npm install
   ```
3. This installs all dependencies, including **resend**. When it finishes without errors, Part B is done.

---

# PART C: Create a Resend Account and Get an API Key

**Goal:** Get an API key so your backend can send password reset emails through Resend.

---

### C.1 Sign Up for Resend

1. Open a browser and go to **[resend.com](https://resend.com)**.
2. Click **Sign up** (or **Get started**).
3. Sign up with your email or GitHub. Complete any verification Resend asks for.

---

### C.2 Create an API Key

1. After logging in, you should see the Resend **Dashboard**.
2. In the left sidebar (or top menu), find **API Keys** (or **Developers** → **API Keys**). Click it.
3. Click **Create API Key** (or **Add API Key**).
4. Give it a name, e.g. **Stock Stay production**.
5. Choose **Sending access** (or full access if that’s the only option).
6. Click **Create** (or **Add**). Resend will show the key **once** (e.g. `re_xxxxxxxxxxxx`).
7. **Copy the key** and save it somewhere safe (e.g. a password manager). You’ll paste it into Railway in Part D. You won’t be able to see it again in Resend.

---

### C.3 (Optional) Use Your Own “From” Address

- **For testing:** You can skip this. Resend lets you send from `onboarding@resend.dev` without verifying a domain.
- **For production (e.g. noreply@stockstay.com):**
  1. In Resend, go to **Domains** (or **Settings** → **Domains**).
  2. Click **Add domain** and enter **stockstay.com** (or your sending domain).
  3. Resend will show DNS records (SPF, DKIM, etc.). Add those records at your DNS provider (where you manage stockstay.com).
  4. After the domain is verified, you can set **RESEND_FROM_EMAIL** in Railway to something like `Stock Stay <noreply@stockstay.com>`.

You can do C.3 later; Part D works with the default Resend sender for testing.

---

# PART D: Set Environment Variables on Railway

**Goal:** Tell your backend the frontend URL (for the reset link) and give it the Resend API key so it can send email.

---

### D.1 Open Your Backend on Railway

1. Go to **[railway.app](https://railway.app)** and log in.
2. Open the project that has your **StockStay** backend service (the one at `stockstay-production.up.railway.app` or similar).
3. Click the **StockStay** service (the backend, not the frontend).

---

### D.2 Open Variables

1. Click the **Variables** tab (or **Config** → **Variables**).
2. You’ll see the variables you already have (e.g. NODE_ENV, JWT_SECRET, DATABASE_URL, CORS_ORIGIN).

---

### D.3 Add APP_URL

1. Click **New Variable** (or **Add variable**, **Raw Editor** → add a line).
2. **Name:** `APP_URL`
3. **Value:** Your frontend URL, with no trailing slash. Examples:
   - `https://stockstay.com`
   - or `https://stockstay-xxx.vercel.app` if you’re not using the custom domain yet.
4. Save (e.g. **Add** or **Update**).

**Why:** The reset email contains a link like `APP_URL/reset-password?token=xxx`. If APP_URL is wrong, the link will point to the wrong site.

---

### D.4 Add RESEND_API_KEY

1. Click **New Variable** again.
2. **Name:** `RESEND_API_KEY`
3. **Value:** Paste the API key you copied in Part C (e.g. `re_xxxxxxxxxxxx`). No quotes, no spaces.
4. Save.

**Why:** Without this, the backend will not send email; it will only log the reset link in the server logs (useful for local dev, not for production).

---

### D.5 (Optional) Add RESEND_FROM_EMAIL

- **Skip this** if you’re fine with emails coming from Resend’s default address (e.g. `onboarding@resend.dev`).
- **Add it** if you verified your own domain in Resend (Part C.3):
  1. **New Variable**
  2. **Name:** `RESEND_FROM_EMAIL`
  3. **Value:** e.g. `Stock Stay <noreply@stockstay.com>` (use the address you verified).
  4. Save.

---

### D.6 Redeploy the Backend

1. Railway often **redeploys automatically** when you change variables. If you see a new deployment starting, wait for it to finish.
2. If nothing redeployed, go to the **Deployments** tab, open the **⋮** menu on the latest deployment, and click **Redeploy**.
3. Wait until the deployment is **Success** or **Active**.

Part D is done when APP_URL and RESEND_API_KEY are set and the backend has been redeployed.

---

# PART E: Deploy the Latest Code (If You Haven’t Already)

**Goal:** Make sure Railway and Vercel are running the code that includes the password reset feature (new API routes, ResetPasswordPage, LoginPage forgot-password calling the API).

---

### E.1 Commit and Push (If You Have Uncommitted Changes)

1. In Terminal, go to the **project root** (not the server folder):
   ```bash
   cd /Users/davidkirwan/inventory-app
   ```
2. Check status:
   ```bash
   git status
   ```
3. If you see modified or new files (e.g. server files, ResetPasswordPage, authApi, etc.):
   ```bash
   git add .
   git commit -m "Add real password reset (forgot-password, reset-password, Resend)"
   git push
   ```
4. **Railway** will redeploy the backend from the new commit. **Vercel** will redeploy the frontend if it’s connected to the same repo. Wait for both to finish.

---

### E.2 If Everything Is Already Pushed

- If you already pushed the password-reset changes earlier, you don’t need to push again. Just ensure Railway and Vercel have finished their latest deployments.

Part E is done when the live backend and frontend are running the version that includes password reset.

---

# PART F: Test the Full Password Reset Flow

**Goal:** Confirm that “Forgot password?” sends an email and that the reset link lets you set a new password and log in.

---

### F.1 Use an Email You Can Access

- Use an email that **already has an account** in your app (e.g. one you used to sign up or the demo account).
- Or sign up once with a real email you control, then use that email for the test.

---

### F.2 Request a Password Reset

1. Open your **frontend** in the browser (e.g. **https://stockstay.com** or your Vercel URL).
2. Go to the **Login** page (e.g. click **Sign In** or open `/login`).
3. Click **“Forgot password?”** (or “Forgot Password?”).
4. Enter the **email address** of an account that exists (e.g. your email or demo@example.com if you use that).
5. Click **“Send Reset Link”** (or **Submit**).
6. You should see a message like: **“If an account exists with that email, we've sent a password reset link. Check your inbox.”**

---

### F.3 Check Your Email

1. Open the inbox for that email address (and check **Spam** / **Promotions** if you don’t see it).
2. You should receive an email from Resend (e.g. “Stock Stay” or “onboarding@resend.dev”) with subject **“Reset your Stock Stay password”**.
3. The email should contain a **button** or **link** that points to your site, e.g. `https://stockstay.com/reset-password?token=...` (or your Vercel URL if you didn’t set APP_URL to stockstay.com).

**If you don’t get the email:**

- Confirm **RESEND_API_KEY** is set correctly on Railway (Part D.4) and that you **redeployed** after adding it.
- Check **Railway** → your service → **Deploy Logs**. After you clicked “Send Reset Link”, you might see a log line like `[FORGOT-PASSWORD] Reset link: https://...` if the send failed (e.g. wrong API key). Fix the key and redeploy.
- Confirm **APP_URL** on Railway matches the site where you’re testing (e.g. https://stockstay.com).

---

### F.4 Open the Reset Link and Set a New Password

1. In the email, click the **reset link** (button or URL). It should open your app at `/reset-password?token=...`.
2. You should see a **“Choose a new password”** (or similar) form.
3. Enter a **new password** (at least 8 characters) and **confirm** it.
4. Click **“Reset password”** (or **Submit**).
5. You should see a success message and then be **redirected to the login page** (sometimes with a message like “Password reset successfully. You can sign in now.”).

---

### F.5 Log In With the New Password

1. On the login page, enter the **same email** and the **new password** you just set.
2. Click **Sign in**.
3. You should be logged in and taken to the dashboard (or home).

If that works, the full password reset flow is working.

---

### F.6 (Optional) Test Invalid or Expired Link

- Open the reset link again in the same browser (or copy the URL and open it again). You should get a message like **“Invalid or expired reset link”** or **“Invalid or missing reset link”**, because the token was already used. That’s correct behavior.

---

# Summary Checklist

- [ ] **Part A:** Ran `npx prisma migrate deploy` in `server` with DATABASE_URL set (Supabase). PasswordResetToken table exists.
- [ ] **Part B:** Ran `npm install` in `server`. Resend package is installed.
- [ ] **Part C:** Created Resend account and API key; copied the key for Part D.
- [ ] **Part D:** On Railway, set **APP_URL**, **RESEND_API_KEY**, and (optional) **RESEND_FROM_EMAIL**; redeployed the backend.
- [ ] **Part E:** Committed and pushed password-reset code; Railway and Vercel deployed the latest version.
- [ ] **Part F:** Tested forgot password → received email → opened reset link → set new password → logged in with new password.

If any step fails, re-read that section and check the “If you don’t get the email” / “If you see an error” notes. For migration or Prisma errors, ensure DATABASE_URL is correct and you’re in the `server` folder when running commands.
