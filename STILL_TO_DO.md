# Still to do (go-live checklist)

Use this list after deploying the app to get full functionality and verify everything works.

---

## 1. Run database migrations

The app starts without running migrations (to avoid advisory-lock timeouts with Supabase). You must run them once so the database has all required columns (e.g. `Invoice.saleId`, `Team` billing/trial/invoice branding).

**Option A – Prisma (recommended)**

From your machine with `DATABASE_URL` pointing at your Supabase database:

```bash
cd server && npm run migrate:deploy
```

On Railway (one-off):

```bash
railway run npm run migrate:deploy
```

**Option B – Supabase SQL Editor**

If you prefer not to use Prisma against production, run the idempotent SQL file in Supabase **SQL Editor**:

1. Open your Supabase project → **SQL Editor**.
2. Paste and run the contents of `server/apply-migrations-supabase.sql`.

See `server/DEPLOY_MIGRATIONS.md` for more detail.

---

## 2. Verify features

After migrations and deploy, quickly check:

- [ ] **Login** – Sign in (including after a password reset).
- [ ] **Sale creation** – Create a sale; confirm an invoice is created and appears on the Invoices page.
- [ ] **Send invoice** – Open an invoice → Send → preview → Send; confirm the client receives the email (if email is configured).
- [ ] **Tax rounding** – Edit a sale or invoice; save; confirm tax stays at 2 decimal places (e.g. 13.00).

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

If you use paid plans or trials with Stripe Checkout:

- Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the price IDs in server env.
- See `server/STRIPE_SETUP.md` and `server/STRIPE_STEP_BY_STEP.md`.

---

## Quick reference

| Task              | Where / command                                      |
|-------------------|------------------------------------------------------|
| Run migrations    | `cd server && npm run migrate:deploy` or run `server/apply-migrations-supabase.sql` in Supabase |
| Migration docs    | `server/DEPLOY_MIGRATIONS.md`                         |
| Email (invoice, reset) | `server/EMAIL_SETUP.md` + `RESEND_API_KEY` or SMTP vars |
| Stripe            | `server/STRIPE_SETUP.md`                              |
