# Still to do (go-live checklist)

Use this list after deploying the app to get full functionality and verify everything works.

**Operator handbook (env vars, AdminJS, plan limits, Umami):** [docs/operations.md](docs/operations.md)  
**New environment provisioning:** [docs/environments.md](docs/environments.md)

---

## 1. Run database migrations

The app starts without running migrations (to avoid advisory-lock timeouts with Supabase). You must run them once so the database matches the current Prisma schema.

**Prisma (recommended)**

From your machine with `DATABASE_URL` pointing at your staging/production database:

```bash
cd server && npm run migrate:deploy
```

On Railway (one-off):

```bash
railway run npm run migrate:deploy
```

See `server/DEPLOY_MIGRATIONS.md` for more detail. Legacy one-off SQL dumps live under `server/archive/sql/` and should not be used for new deploys.

---

## 2. Verify features

After migrations and deploy, quickly check:

- [ ] **Signup / login** – Create a Free account (no payment); sign in after email verify; password reset.
- [ ] **Stock** – Create location / supply item / SKU; receive stock; replenish a property.
- [ ] **Billing** – Generate draft invoices from unbilled lines; send (PDF + email); CSV export.
- [ ] **Plan limits** – Free caps block creates when over limit; upgrade from Settings.
- [ ] **Feedback** – App footer “Send feedback” (or Settings contact) delivers email.
- [ ] **Legal** – `/terms` and `/privacy` reachable from marketing and app footers.
- [ ] **Admin** (if enabled) – `{API}/admin` login with an allowlisted user.

---

## 3. Email configuration (Send invoice & password reset)

For **sending invoices by email** and **password reset emails**, set one of these in your **server** environment (e.g. Railway env vars):

**Resend (simplest)**

- `RESEND_API_KEY` – from [resend.com](https://resend.com)
- `RESEND_FROM_EMAIL` – e.g. `Stock Stay <onboarding@resend.dev>` or your verified domain

**Or SMTP**

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Also set `APP_URL` (or `FRONTEND_URL`) to your frontend URL so links in emails are correct.

Details: `server/EMAIL_SETUP.md`.

---

## 4. Stripe (billing & trials)

Paid plans and trials use Stripe Checkout **after** signup (Settings):

- Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the price IDs in server env.
- See `server/STRIPE_SETUP.md`.

---

## 5. Platform admin (optional)

To enable support AdminJS:

1. Set `SUPER_ADMIN_EMAILS` to existing User emails (comma-separated).
2. Set `ADMIN_SESSION_SECRET` (or rely on `JWT_SECRET`).
3. Open `{API_ORIGIN}/admin` and sign in with that user’s password.

Details: [docs/operations.md §4](docs/operations.md#4-platform-admin-adminjs).

---

## 6. Plan limits

Caps are in `server/plan-limits.json` (restart API after edits). Optional override: `PLAN_LIMITS_PATH`.

Details: [docs/operations.md §5](docs/operations.md#5-plan-limits).

---

## 7. Analytics (optional)

On the **frontend** build env, set both:

- `VITE_UMAMI_SCRIPT_URL`
- `VITE_UMAMI_WEBSITE_ID`

Details: [docs/operations.md §6](docs/operations.md#6-analytics-umami-cloud).

---

## 8. Support data deletion (alpha)

There is no in-app “delete my account” button. For deletion requests, follow:

**[docs/support-data-deletion.md](docs/support-data-deletion.md)**

(AdminJS `/admin` + verify requester → remove/anonymize User / memberships / org as appropriate → confirm by email.)

---

## Quick reference

| Task | Where / command |
|------|-----------------|
| Ops handbook | `docs/operations.md` |
| Test matrix / harness | `docs/test-matrix.md`; `cd server && npm install --include=dev && npm test` |
| New env / staging | `docs/environments.md` |
| Run migrations | `cd server && npm run migrate:deploy` |
| Migration docs | `server/DEPLOY_MIGRATIONS.md` |
| Email (invoice, reset) | `server/EMAIL_SETUP.md` + `RESEND_API_KEY` or SMTP vars |
| Stripe | `server/STRIPE_SETUP.md` |
| AdminJS | `SUPER_ADMIN_EMAILS` → `{API}/admin` |
| Plan limits | `server/plan-limits.json` |
| Support data deletion | `docs/support-data-deletion.md` |
