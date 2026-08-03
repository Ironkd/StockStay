# Still to do (go-live checklist)

Use this list after deploying the app to get full functionality and verify everything works.

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

## 5. Support data deletion (alpha)

There is no in-app “delete my account” button. For deletion requests, follow:

**[docs/support-data-deletion.md](docs/support-data-deletion.md)**

(AdminJS `/admin` + verify requester → remove/anonymize User / memberships / org as appropriate → confirm by email.)

---

## Quick reference

| Task | Where / command |
|------|-----------------|
| Run migrations | `cd server && npm run migrate:deploy` |
| Migration docs | `server/DEPLOY_MIGRATIONS.md` |
| Email (invoice, reset) | `server/EMAIL_SETUP.md` + `RESEND_API_KEY` or SMTP vars |
| Stripe | `server/STRIPE_SETUP.md` |
| Support data deletion (alpha) | `docs/support-data-deletion.md` |
