# Environments

Stock Stay runs as three isolated stacks. **Never** point a non-prod frontend at the production API, or share `DATABASE_URL` / `JWT_SECRET` across environments.

**Stack:** Vercel (frontend) + Railway (API in `server/`) + Supabase Postgres (staging/prod). Local API uses **Docker Postgres** by default (same Prisma migrations as cloud).

## Matrix


|            | Local                                                       | Staging                         | Production                         |
| ---------- | ----------------------------------------------------------- | ------------------------------- | ---------------------------------- |
| Frontend   | Vite (`localhost:5173`)                                     | Vercel Staging / Preview        | Vercel Production                  |
| API        | Express (`localhost:3000`)                                  | Railway `stockstay-api-staging` | Railway `stockstay-api-production` |
| Database   | Docker Postgres on **localhost:5433** (or Supabase **dev**) | Supabase **staging** project    | Supabase **prod** project          |
| Git branch | any                                                         | `staging`                       | `main`                             |
| Stripe     | Test keys                                                   | Test keys                       | Live keys                          |
| `NODE_ENV` | `development`                                               | `production`                    | `production`                       |
| `APP_ENV`  | `local`                                                     | `staging`                       | `production`                       |


`APP_ENV` distinguishes staging from live while both use `NODE_ENV=production` for Node hardening. `JWT_SECRET` is **required** when `APP_ENV` is `staging` or `production`.

## Local development (Docker Postgres)

> **Note:** Host port is **5433** (maps to container 5432) so it does not collide with other local Postgres instances on 5432.

1. Start Postgres:
  ```bash
   docker compose up -d
  ```
2. Copy env examples and set local values:
  ```bash
   cp .env.example .env
   cp server/.env.example server/.env
  ```
   In `server/.env`, use:
   If port 3000 is already in use, set `PORT=3001` and point the frontend at `http://localhost:3001/api`.
3. Apply schema and run the API:
  ```bash
   cd server
   npx prisma generate
   # Fresh Docker volume (or any empty Postgres): apply the baseline migration.
   npx prisma migrate deploy
   npm run dev
  ```
4. Run the frontend from the repo root:
  ```bash
   npm run dev
  ```
   Keep `VITE_API_BASE_URL` matching the API (default `http://localhost:3000/api`).

**Alternative:** point `DATABASE_URL` at a dedicated Supabase **dev** project instead of Docker. Do not use the production Supabase URL on your laptop.

There is **no** shared demo login. Create an account via signup; verification links are logged to the API console when Resend/SMTP is unset.

## Branch → environment mapping


| Branch    | Deploys to                                                  |
| --------- | ----------------------------------------------------------- |
| `main`    | Production (Vercel Production + Railway production service) |
| `staging` | Staging (Vercel Staging/Preview + Railway staging service)  |


Protect `main` so only reviewed merges land in production. Create `staging` from `main` once and keep it as the long-lived staging branch.

## Secrets (never share across envs)

Canonical lists: **[operations.md §2](operations.md#2-environment-variables-complete)**, [server/.env.example](../server/.env.example), [.env.example](../.env.example).

Minimum per deployed environment:


| Variable                   | Notes                                                    |
| -------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`             | That env’s Supabase (or Docker) Postgres URL             |
| `JWT_SECRET`               | Unique random string per env (`openssl rand -base64 32`) |
| `APP_ENV`                  | `staging` or `production`                                |
| `NODE_ENV`                 | `production` on Railway                                  |
| `CORS_ORIGIN`              | Comma-separated frontend origin(s) for that env only     |
| `APP_URL` / `FRONTEND_URL` | Frontend origin (password-reset / invite links)          |
| `STRIPE_*`                 | Test keys on staging; live keys on production            |
| `RESEND_API_KEY`           | Optional; email falls back to console/SMTP               |
| `SUPER_ADMIN_EMAILS`       | Optional; enable AdminJS at `/admin` for support         |
| `ADMIN_SESSION_SECRET`     | Optional; AdminJS cookies (falls back to `JWT_SECRET`)   |
| `PLAN_LIMITS_PATH`         | Optional; override path to plan-limits JSON              |


Frontend build-time: `VITE_API_BASE_URL` must be the **same** environment’s API (`…/api`). Optional: `VITE_UMAMI_SCRIPT_URL` + `VITE_UMAMI_WEBSITE_ID`, `VITE_GOOGLE_MAPS_API_KEY`.
## Staging provisioning checklist

Do this **once** to create a safe “practice” copy of Stock Stay that is separate from the live site. You can tick items as you go.

**What you’re building:** a second website + API + database that look like production but use **test** payments and a **different** database, so mistakes don’t affect real customers.

**Accounts you’ll need** (sign in with GitHub where possible):

- [Supabase](https://supabase.com) — database  
- [Railway](https://railway.app) — API server  
- [Vercel](https://vercel.com) — website (frontend)  
- [Stripe](https://dashboard.stripe.com) — payments (**Test mode**)  
- Optional: [Resend](https://resend.com) — email

**Golden rules**

1. Staging and production must never share the same database URL or `JWT_SECRET`.
2. Staging Stripe keys must start with `sk_test_` / `pk_test_` — never paste live (`sk_live_`) keys into staging.
3. Keep a notes file (or password manager) for staging URLs and variable names. Don’t commit secrets to GitHub.

---



### Step 0 — Create the `staging` Git branch

**Status:** Done on [Ironkd/StockStay](https://github.com/Ironkd/StockStay) — long-lived `staging` tracks the same commit as `main` until you start shipping staging-only work.

If you ever need to recreate it from another clone:

```bash
git checkout main
git pull
git checkout -b staging
git push -u origin staging
```

**Done when:** In GitHub → **Branches**, you see `staging` and `main`.

This workspace is pinned to **Ironkd/StockStay only** (`gh repo set-default` + Cursor rule). Do not point remotes or `gh` commands at other GitHub repos from this project.

---



### Step 1 — Supabase staging database

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Click **New project**.
3. Name it something clear, e.g. `stockstay-staging`.
4. Set a strong database password and **save it** somewhere safe (you’ll need it for the connection string).
5. Choose a region close to you; create the project and wait until it’s ready.
6. In the left sidebar: **Project Settings** (gear) → **Database**.
7. Find **Connection string** → **URI**.
8. Copy the URI. It looks like:
  `postgresql://postgres:...@db.xxxxx.supabase.co:5432/postgres`
9. Replace `[YOUR-PASSWORD]` in the string with the real password if Supabase left a placeholder.
10. Prefer the **Session pooler** / pooler connection if Supabase recommends it for server apps (often port `6543`).
11. Leave the database **empty**. Railway’s start command runs `prisma migrate deploy`, which applies the baseline migration and creates all tables. Do not run `db push` against staging.

**Done when:** You have a connection string for **staging only**, different from production.

- [ ] Supabase staging project created  
- [ ] Staging `DATABASE_URL` copied and stored safely  

---



### Step 2 — Railway staging API

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → select the Stock Stay repo.
3. If Railway creates a service automatically, open it. Rename it to something like `stockstay-api-staging` (optional but helpful).
4. Open the service → **Settings**:
  - **Root Directory:** type `server` (important — the API lives in that folder).  
  - **Branch:** choose `staging` (not `main`).
5. Still under Settings (or the service’s build settings), set:
  - **Build Command:** `npm install --omit=dev && npm run build`  
  - **Start Command:** `npm start`  
  *(This runs database migrations, then starts the API.)*
6. Open **Variables** and add these (use **Add variable** for each):

  | Name           | Example / how to get it                                                         |
  | -------------- | ------------------------------------------------------------------------------- |
  | `APP_ENV`      | `staging`                                                                       |
  | `NODE_ENV`     | `production`                                                                    |
  | `DATABASE_URL` | Paste the **staging** Supabase URI from Step 1                                  |
  | `JWT_SECRET`   | Generate a new random string (see below). Do **not** reuse production’s secret. |
  | `PORT`         | `3000` (Railway often sets this for you; if so, you can skip)                   |
  | `APP_URL`      | Leave blank until Step 3 has a Vercel URL, then set it to that URL              |
  | `CORS_ORIGIN`  | Same as `APP_URL` once you have the Vercel URL                                  |

   **Generate** `JWT_SECRET`**:** on a Mac, open Terminal and run:
   Copy the output into Railway as `JWT_SECRET`.
7. Deploy / wait for the build to finish (Deployments tab).
8. Open **Settings → Networking / Domains** (wording varies) and generate a public URL, e.g. `https://stockstay-api-staging.up.railway.app`.
9. In a browser, open:j
  `https://YOUR-RAILWAY-HOST/api/health`  
   You should see JSON including `"status":"ok"` and `"appEnv":"staging"`.

**Done when:** Health check works on the staging API URL.

- [ ] Railway service uses root `server` and branch `staging`  
- [ ] Staging variables set (especially `DATABASE_URL`, `JWT_SECRET`, `APP_ENV`)  
- [ ] Public API URL noted: `https://__________________/api`  
- [ ] `/api/health` returns OK  

---



### Step 3 — Vercel staging website

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. If the project already exists (production), open it. Otherwise **Add New → Project** and import the same repo.
3. Open **Settings → Environments** (or **Git**):
  - Ensure the `staging` branch deploys to a **Preview** or dedicated **Staging** environment.  
  - Keep `main` as Production.
4. Open **Settings → Environment Variables**.
5. Add:

  | Name                | Value                                                                | Environment                                     |
  | ------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
  | `VITE_API_BASE_URL` | `https://YOUR-RAILWAY-HOST/api` (from Step 2 — must end with `/api`) | **Preview** / Staging only — **not** Production |

6. Trigger a deploy of the `staging` branch (push a small commit, or **Deployments → Redeploy**).
7. Open the Preview/Staging URL Vercel gives you (something like `https://stockstay-….vercel.app`).
8. Copy that exact URL (no trailing slash).

**Back on Railway (finish the loop):**

1. Set `APP_URL` = the Vercel staging URL.
2. Set `CORS_ORIGIN` = the same Vercel staging URL.
3. Redeploy the Railway staging service so the new variables apply.

**Done when:** Opening the staging website loads the login/signup page (even if signup isn’t fully tested yet).

- [ ] `VITE_API_BASE_URL` points at staging API only  
- [ ] Staging site URL noted: `https://__________________`  
- [ ] Railway `APP_URL` and `CORS_ORIGIN` match that URL  

---



### Step 4 — Stripe Test mode (payments for staging)

1. Open [Stripe Dashboard](https://dashboard.stripe.com).
2. Turn **Test mode** **ON** (toggle in the top bar — it should say Test).
3. **Developers → API keys** → copy the **Secret key** (`sk_test_…`) into Railway staging as `STRIPE_SECRET_KEY`.
4. Create or reuse **Products/Prices** in Test mode for Starter/Pro (monthly/annual) and optional extra-user add-on.
5. Copy each Price ID (`price_…`) into Railway staging:
  - `STRIPE_PRO_PRICE_ID`  
  - `STRIPE_PRO_ANNUAL_PRICE_ID` (if used)  
  - `STRIPE_STARTER_PRICE_ID` (if used)  
  - `STRIPE_STARTER_ANNUAL_PRICE_ID` (if used)  
  - `STRIPE_EXTRA_USER_PRICE_ID` (if used)
6. **Developers → Webhooks → Add endpoint**
  - Endpoint URL: `https://YOUR-RAILWAY-HOST/api/billing/webhook`  
  - Listen to subscription-related events (or the same set production uses).
7. After creating the webhook, open it → **Reveal** signing secret (`whsec_…`) → set Railway `STRIPE_WEBHOOK_SECRET`.
8. Redeploy Railway staging after adding Stripe variables.

**Done when:** Staging Railway has test Stripe keys and a webhook pointing at the **staging** API (not production).

- [ ] Stripe Test mode keys on Railway staging  
- [ ] Webhook URL is the staging API  
- [ ] Price IDs set  

---



### Step 5 — Email (optional but recommended)

Without email, signup still works, but verification links appear only in Railway **Logs**.

1. Sign up at [Resend](https://resend.com) (or use SMTP).
2. Create an API key → Railway staging `RESEND_API_KEY`.
3. Set `RESEND_FROM_EMAIL` (e.g. `Stock Stay Staging <onboarding@resend.dev>` while testing).
4. Redeploy Railway staging.

- [ ] Staging can send verification / reset emails (or you’re OK reading links from logs)

---

### Step 5b — Platform admin & analytics (optional)

**AdminJS** (support console on the API):

1. Sign up a user on the staging site and verify email.
2. On Railway staging, set `SUPER_ADMIN_EMAILS` to that email (comma-separated if several).
3. Set `ADMIN_SESSION_SECRET` to a random string (or rely on `JWT_SECRET`).
4. Redeploy → open `https://YOUR-RAILWAY-HOST/admin` and log in with that user’s password.

Details: [operations.md §4](operations.md#4-platform-admin-adminjs).

**Umami** (frontend):

1. Create a website in Umami Cloud.
2. On Vercel Preview/Staging, set `VITE_UMAMI_SCRIPT_URL` and `VITE_UMAMI_WEBSITE_ID`.
3. Redeploy the staging frontend.

Details: [operations.md §6](operations.md#6-analytics-umami-cloud).

- [ ] AdminJS reachable (or deliberately left disabled)
- [ ] Umami configured (or intentionally skipped)

---

### Step 6 — Smoke test (prove it works)

On the **staging** website (not production):

1. Open `https://YOUR-RAILWAY-HOST/api/health` — expect `"appEnv":"staging"`.
2. Open the staging site → **Sign up** with a real email you can access.
3. Verify email (inbox, or Railway logs if Resend isn’t set).
4. Log in.
5. Confirm you are **not** on the production domain and that there is **no** “demo@example.com” login hint.
6. Optional: open `{API}/admin` if `SUPER_ADMIN_EMAILS` is set; send feedback from the app footer; confirm `/terms` and `/privacy`.

- [ ] Health OK  
- [ ] Signup + verify + login OK  
- [ ] Confirmed this is staging, not production  
- [ ] Optional admin / feedback / legal smoke OK  

---



### Step 7 — Protect production (GitHub admin)

Branch protection and GitHub Environments require **admin** on the repo (owner **Ironkd**). Collaborators with write can push `staging` / open PRs, but cannot create these settings.

**One-shot (preferred):** repo owner runs:

```bash
# Must be logged in as an admin on Ironkd/StockStay
gh auth login   # if needed
./scripts/github-admin-setup.sh
```

That script:

1. Creates GitHub Environments `staging` (deploys from `staging` only) and `production` (deploys from `main` only).
2. Adds rulesets so `main` and `staging` cannot be force-pushed or deleted; `main` also requires a pull request (0 approvals — enough to stop accidental direct pushes while a solo owner can still merge).

**Manual alternative:** GitHub → **Settings → Environments** and **Settings → Rules → Rulesets** with the same branch mapping.

Then:

1. On Railway **production** and Vercel **Production**, confirm variables still point at the **production** Supabase URL and **live** Stripe keys.
2. If any secret was ever shared, committed, or reused between staging and prod, **rotate** it (new `JWT_SECRET`, new DB password, new Stripe webhook secret).

- [ ] `./scripts/github-admin-setup.sh` run by Ironkd (or equivalent UI settings)  
- [ ] Production secrets are production-only  
- [ ] Any leaked/shared secrets rotated  

---



### Optional — Supabase “dev” project

If someone can’t run Docker locally, create a third Supabase project named `stockstay-dev` and give them that `DATABASE_URL` for laptop use only. Still never use the production URL on a laptop.

---



## Resetting a database to empty (baseline replay)

Use this when a Supabase project already has a failed/partial migration history or leftover tables and you want `prisma migrate deploy` to build schema from scratch. **This deletes all app data.**

For **each** environment (staging, then production when you are ready):

1. In that project’s Supabase **SQL Editor**, run:

   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   GRANT ALL ON SCHEMA public TO postgres;
   GRANT ALL ON SCHEMA public TO public;
   ```

2. Confirm Railway’s `DATABASE_URL` for that env still points at this project (session/pooler URI).

3. Redeploy the Railway service for that env so `npm start` → `prisma migrate deploy` applies `20260714120000_baseline`.

4. Check `https://YOUR-RAILWAY-HOST/api/health` returns ok. Optionally from `server/` with that env’s `DATABASE_URL`:

   ```bash
   npx prisma migrate status
   ```

   Expect one applied migration (`20260714120000_baseline`), none failed or pending.

Local Docker after a bad state: recreate the volume (or drop/recreate the DB), then `npx prisma migrate deploy` in `server/`.

---



## Production notes

- Existing production Supabase + Railway + Vercel remain the production stack.
- After staging exists, prefer merging `staging` → `main` (or PRs into `main`) rather than deploying untested commits straight to prod.
- Stripe **Live** webhooks must target the production API only.
- If production still has the old multi-migration history, wipe public schema (section above) **after** this baseline is on `main`, then redeploy Railway production once.



## Related docs

- **[operations.md](operations.md)** — full env var catalog, AdminJS, plan limits, Umami, feedback, deletion, smoke tests
- [support-data-deletion.md](support-data-deletion.md) — support-handled account deletion via AdminJS
- [requirements.md](requirements.md) — NFR-1, NFR-12, Appendix A
- [../README.md](../README.md) — quick start
- [../STILL_TO_DO.md](../STILL_TO_DO.md) — go-live checklist
- [../DEPLOY.md](../DEPLOY.md) — older single-env deploy steps (use alongside this matrix)
- [../server/.env.example](../server/.env.example) — backend variable template
- [../.env.example](../.env.example) — frontend variable template
