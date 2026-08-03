# Stock Stay — Operations handbook

How to run, configure, and support Stock Stay after the pre-alpha domain work (stock ledger, billing, plans, AdminJS, Umami).

**Product requirements (source of truth):** [requirements.md](requirements.md)  
**Environment provisioning (staging checklist):** [environments.md](environments.md)  
**Go-live checklist:** [../STILL_TO_DO.md](../STILL_TO_DO.md)

---

## 1. Architecture (quick)

| Layer | Local | Staging / Production |
|-------|--------|----------------------|
| Frontend | Vite (`localhost:5173`) | Vercel |
| API | Express in `server/` (`PORT`, default 3000) | Railway (root directory `server`) |
| Database | Docker Postgres on **5433** | Supabase Postgres |
| Auth token | Browser **sessionStorage** (cleared with the tab) | Same |
| Platform admin | `{API}/admin` (AdminJS) | Same, allowlist-gated |

Branches: `staging` → staging stack; `main` → production. Never share `DATABASE_URL` or `JWT_SECRET` across environments.

---

## 2. Environment variables (complete)

Copy examples, then fill per environment:

```bash
cp .env.example .env
cp server/.env.example server/.env
```

### 2.1 Frontend (root `.env` / Vercel)

Build-time only (`VITE_*`). Redeploy the frontend after changing these.

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_API_BASE_URL` | **Yes** | API base including `/api` (e.g. `http://localhost:3000/api`, staging Railway `…/api`) |
| `VITE_GOOGLE_MAPS_API_KEY` | No | Google Places address autocomplete; omit → manual address fields |
| `VITE_UMAMI_SCRIPT_URL` | No* | Umami Cloud script URL (e.g. `https://cloud.umami.is/script.js`) |
| `VITE_UMAMI_WEBSITE_ID` | No* | Umami website id |

\*Both Umami vars must be set together. If either is missing, analytics is a no-op (no script errors).

### 2.2 Backend (`server/.env` / Railway)

| Variable | Required | Purpose |
|----------|----------|---------|
| `APP_ENV` | **Yes** | `local` \| `staging` \| `production` (distinguishes staging vs live when `NODE_ENV=production`) |
| `NODE_ENV` | **Yes** | `development` locally; `production` on Railway |
| `PORT` | No | Default `3000` |
| `DATABASE_URL` | **Yes** | Postgres URI (Docker local or Supabase session/pooler) |
| `JWT_SECRET` | **Yes** on staging/prod | Signs API JWTs; unique per env |
| `CORS_ORIGIN` | **Yes** on deployed | Comma-separated frontend origin(s), no trailing slash |
| `APP_URL` | **Yes** for email links | Frontend origin (verification, reset, invites). Alias: `FRONTEND_URL` |
| `RESEND_API_KEY` | No | Preferred email provider |
| `RESEND_FROM_EMAIL` | No | e.g. `Stock Stay <onboarding@resend.dev>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | No | Alternative to Resend |
| `STRIPE_SECRET_KEY` | For paid plans | `sk_test_…` staging; `sk_live_…` production only |
| `STRIPE_WEBHOOK_SECRET` | For paid plans | `whsec_…` from Stripe webhook endpoint |
| `STRIPE_PRO_PRICE_ID` | For Pro | Stripe Price id |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Optional | Annual Pro |
| `STRIPE_STARTER_PRICE_ID` | For Starter | Stripe Price id |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | Optional | Annual Starter |
| `STRIPE_EXTRA_USER_PRICE_ID` | Optional | Extra seat add-on |
| `PLAN_LIMITS_PATH` | No | Absolute path to an alternate plan-limits JSON (default: `server/plan-limits.json`) |
| `SUPER_ADMIN_EMAILS` | No | Comma-separated User emails allowed into AdminJS. **Empty = `/admin` returns 404** |
| `ADMIN_SESSION_SECRET` | Recommended on staging/prod | AdminJS session cookie secret; falls back to `JWT_SECRET` |

**Health check:** `GET {API_ORIGIN}/api/health` should return JSON with `"status":"ok"` and `"appEnv"`.

---

## 3. Setting up a new environment

### 3.1 Local (developer laptop)

1. `docker compose up -d` — Postgres on **localhost:5433**.
2. Copy env examples (section 2).
3. In `server/.env`: Docker `DATABASE_URL`, `APP_ENV=local`, `JWT_SECRET` (any long string), `CORS_ORIGIN=http://localhost:5173`, `APP_URL=http://localhost:5173`.
4. If port 3000 is taken: set `PORT=3001` and `VITE_API_BASE_URL=http://localhost:3001/api`.
5. From `server/`:

   ```bash
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm run dev
   ```

6. From repo root: `npm install && npm run dev`.
7. Open `http://localhost:5173` → **Sign up** (Free plan; no card). Without Resend/SMTP, verification links are printed in the API console.

Full staging/production provisioning (Supabase + Railway + Vercel + Stripe Test): follow **[environments.md](environments.md)** step-by-step.

### 3.2 Checklist when cloning an env

- [ ] New database (never reuse prod `DATABASE_URL`)
- [ ] New `JWT_SECRET` / `ADMIN_SESSION_SECRET`
- [ ] `APP_ENV` set correctly
- [ ] `CORS_ORIGIN` + `APP_URL` match that env’s frontend
- [ ] Frontend `VITE_API_BASE_URL` points at **that** env’s API `…/api`
- [ ] Stripe **test** keys on staging; **live** only on production
- [ ] Migrations applied (`prisma migrate deploy` via `npm start` or one-off)
- [ ] `/api/health` shows the expected `appEnv`

---

## 4. Platform admin (AdminJS)

AdminJS is a **platform support** UI over the Prisma schema — not for normal customers.

### Enable

1. Create (or use) a normal Stock Stay **User** account (signup + verify).
2. On the **API** host, set:

   ```bash
   SUPER_ADMIN_EMAILS=you@example.com,other@example.com
   ADMIN_SESSION_SECRET=<long random string>   # or rely on JWT_SECRET
   ```

3. Restart/redeploy the API. Logs should show: `AdminJS mounted at /admin`.

### Access

- URL: `http://localhost:3000/admin` locally, or `https://YOUR-RAILWAY-HOST/admin` in cloud.
- Login with the **same email/password** as the allowlisted User.
- Emails not on `SUPER_ADMIN_EMAILS` cannot authenticate even with a valid password.

### Disable

Leave `SUPER_ADMIN_EMAILS` empty (or unset). `GET /admin` returns **404** with a short JSON message.

### What you can do

CRUD across core models (User, Organization, Team, UserMembership, Property, Client, Invoice, stock catalogue, ledger, etc.). User password hashes are hidden from the AdminJS edit UI.

### Support deletion

Alpha has **no** self-serve “delete my account”. Use AdminJS per **[support-data-deletion.md](support-data-deletion.md)**.

### Security notes

- AdminJS sets **session cookies** on the API host for allowlisted operators only (disclosed in Privacy Policy).
- End-user app auth uses **sessionStorage JWTs**, not those cookies.
- Restrict who you put on `SUPER_ADMIN_EMAILS`; treat `/admin` like production DB access.

---

## 5. Plan limits

Limits for Free / Starter / Pro live in **`server/plan-limits.json`**. The API loads the file **once at boot**. Marketing (`GET /api/plans`) and enforcement (`GET /api/team/limits`, create endpoints, over-limit banner) all read the same config.

### Edit limits

1. Change values in `server/plan-limits.json` (or point `PLAN_LIMITS_PATH` at another JSON file with the same shape).
2. Keep `plans.free`, `plans.starter`, and `plans.pro` present.
3. Use `null` for “unlimited” on count fields where supported.
4. Update `marketingFeatures` strings if Landing/Pricing copy should match.
5. **Restart the API** (local `npm run dev` restart, or Railway redeploy).

### Example fields

- Caps: `maxProperties`, `maxStockLocations`, `maxSupplyItems`, `maxSkus`, `maxInventoryItems`
- Users: `baseMaxUsers`, `maxExtraUserSlots`, `maxUsers` (legacy/simple caps)
- Display: `monthlyPrice`, `annualPrice`, `currency`, `extraUserPrice`

### Over-limit behavior (BR-20)

Existing data is **kept**. Creates that would exceed the plan return **403** with a structured `PLAN_LIMIT` error; the app shows an over-limit banner. Users upgrade via Settings → Stripe Checkout (after signup — payment is never required to create an account).

### Stripe prices vs JSON prices

Displayed dollar amounts in `plan-limits.json` should match your Stripe Products/Prices. Changing JSON does **not** change Stripe; update Price IDs in env when you change billing amounts in Stripe.

---

## 6. Analytics (Umami Cloud)

1. Create a website in [Umami Cloud](https://cloud.umami.is).
2. Set on the **frontend** build:

   ```bash
   VITE_UMAMI_SCRIPT_URL=https://cloud.umami.is/script.js
   VITE_UMAMI_WEBSITE_ID=<your-id>
   ```

3. Redeploy Vercel (or restart Vite locally).

**Tracked:** SPA pageviews; custom events `signup` and `feedback_sent`.  
**Without env:** app runs normally; helpers no-op.  
**Not used:** GA4 / cookie consent banner (auth is sessionStorage; Umami is optional and privacy-oriented).

Code: `src/lib/analytics.ts`, `src/components/UmamiAnalytics.tsx`.

---

## 7. Feedback and support email

| Entry point | Who | Backend |
|-------------|-----|---------|
| Landing contact form | Anyone | `POST /api/contact` → `sendSupportEmail` |
| Settings → Contact support | Signed-in | Same |
| App footer → **Send feedback** | Signed-in | Same |

Requires working email (`RESEND_*` or SMTP). Without email config, contact may fail depending on server path — configure Resend for staging/prod.

Support inbox: **support@stockstay.com** (as used in product copy).

---

## 8. Legal pages

- Public routes: `/terms`, `/privacy`
- Linked from Landing footer and authenticated Layout footer
- Boilerplate for alpha (not lawyer-reviewed): Free signup, inventory/billing product, sessionStorage auth, AdminJS cookies, Umami, support-handled deletion

---

## 9. Client billing (operators / PMs)

- Team **billing timezone** (`Team.billingTimezone`, IANA) is editable in Settings; used for scheduled draft periods.
- Billing UI: generate drafts from unbilled replenishment/return lines, send PDF+email, CSV export.
- Daily job on the API generates drafts when due (see `server/clientBilling.js`).

SaaS subscription billing (Free → Starter/Pro) is separate — Stripe in Settings. See `server/STRIPE_SETUP.md`.

---

## 10. Roles and write access

| Role | Notes |
|------|--------|
| Owner | Full team control, invites, plan |
| Member | Page permissions (`allowedPages`) |
| Viewer | **Read-only** — API `requireWriteAccess` returns `VIEWER_READ_ONLY`; UI hides/disables writes (`canWrite`) |

Platform AdminJS is independent of team roles (email allowlist only).

---

## 11. Database migrations

Railway start command runs migrations then the server. One-off:

```bash
cd server && npm run migrate:deploy
# or
railway run npm run migrate:deploy
```

Reset / baseline replay (destructive): [environments.md — Resetting a database](environments.md#resetting-a-database-to-empty-baseline-replay).  
Legacy SQL dumps under `server/archive/` are **not** for new deploys.

---

## 12. Email and Stripe (pointers)

| Topic | Doc |
|-------|-----|
| Resend / SMTP | `server/EMAIL_SETUP.md` |
| Stripe Checkout, webhooks, prices | `server/STRIPE_SETUP.md` |
| Migrations on deploy | `server/DEPLOY_MIGRATIONS.md` |
| Older single-env deploy notes | `DEPLOY.md` (use with environments matrix) |

---

## 13. Smoke test (any new env)

1. `GET /api/health` → ok + expected `appEnv`
2. Signup Free → verify email → login
3. Create stock location, supply item, SKU; receive stock; replenish a property
4. Generate / send invoice (email configured)
5. Hit a Free-plan create cap → banner / 403
6. If AdminJS enabled: open `/admin`, sign in with allowlisted user
7. Optional: set Umami vars → confirm pageview in Umami dashboard
8. Footer **Send feedback** → support email received

---

## 14. Automated tests (Appendix A #13)

| Suite | Command | Needs |
|-------|---------|--------|
| Server unit + API | `cd server && npm install --include=dev && npm test` | Docker Postgres on **5433**; creates/uses DB `stockstay_test` |
| Frontend RTL | `npm test -- --run` (repo root) | none |
| Story map | [test-matrix.md](test-matrix.md) | — |

**Note:** `server/.npmrc` sets `omit=dev` for production images. Locally/CI use `npm install --include=dev` (or `npm ci --include=dev`) so Vitest and Supertest install.

Optional env: `TEST_DATABASE_URL` (defaults to `postgresql://stockstay:stockstay@localhost:5433/stockstay_test`).

CI: [`.github/workflows/test.yml`](../.github/workflows/test.yml) runs both suites on PRs and pushes to `staging` / `main`.

Playwright browser E2E is **deferred**.

---

## 15. Dependency hygiene (NFR-24)

- Prefer **within-major** patches for Vite, Vitest, Prisma, and other critical deps (no surprise majors mid-sprint).
- After bumps: run root `npm test -- --run` + `npm run build`, and `cd server && npm install --include=dev && npm test`.
- Cadence: at least when closing an Appendix A slice, or monthly before launch.
- Do not use `npm audit fix --force` unless an incident requires it; document leftover high/critical vulns if deferred.

---

## 16. PITR / backups (NFR-9)

See **[pitr-recovery.md](pitr-recovery.md)** — verify Supabase daily backups or PITR on staging/prod; staging restore dry-run; no unscheduled prod restore.

---

## 17. Doc map

| Doc | Use when |
|-----|----------|
| [operations.md](operations.md) (this file) | Day-to-day config & support |
| [pitr-recovery.md](pitr-recovery.md) | Backup / PITR verification |
| [test-matrix.md](test-matrix.md) | Section 8 story → test status |
| [environments.md](environments.md) | First-time staging/prod stacks |
| [requirements.md](requirements.md) | What to build / acceptance |
| [support-data-deletion.md](support-data-deletion.md) | Deletion requests |
| [../README.md](../README.md) | Quick start + API overview |
| [../STILL_TO_DO.md](../STILL_TO_DO.md) | Post-deploy checklist |
| `server/.env.example` / `.env.example` | Canonical env templates |
