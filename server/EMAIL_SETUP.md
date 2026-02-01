# Email setup (verification, password reset, send invoice)

The server sends email for:

- **Sign-up verification** – link to verify email
- **Password reset** – link to set a new password
- **Send invoice** – PDF/invoice email to the client

Use either **Resend** (simplest) or **SMTP**. Set these in your **server** environment (e.g. Railway env vars or `server/.env`).

---

## Option 1: Resend (recommended)

1. Sign up at [resend.com](https://resend.com) and get an API key.
2. In server env:

```env
APP_URL=https://your-frontend-domain.com
RESEND_API_KEY=re_xxxx
RESEND_FROM_EMAIL=Stock Stay <onboarding@resend.dev>
# Or your verified domain: Stock Stay <noreply@yourdomain.com>
```

Resend is used for verification, password reset, and **send invoice**. No SMTP vars needed.

---

## Option 2: SMTP

Set these in server env (copy from `server/.env.example` and fill in values).

```env
APP_URL=http://localhost:5173
# Production: APP_URL=https://your-frontend-domain.com

SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=StockStay <noreply@yourdomain.com>
```

---

## Option A: Gmail

1. Use a **Google App Password** (not your normal Gmail password):
   - Go to [Google Account → Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification if needed
   - Under "2-Step Verification", choose **App passwords** → generate one for "Mail"
   - Use that 16-character password as `SMTP_PASS`

2. In `server/.env`:

```env
APP_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM=StockStay <your-email@gmail.com>
```

---

## Option B: SendGrid

1. Sign up at [sendgrid.com](https://sendgrid.com) and create an API key (with "Mail Send" permission).
2. In `server/.env`:

```env
APP_URL=http://localhost:5173
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your-actual-api-key-here
SMTP_FROM=StockStay <noreply@yourdomain.com>
```

Use `apikey` literally for `SMTP_USER`; put your SendGrid API key in `SMTP_PASS`. The "From" address should be a verified sender in SendGrid.

---

## Option C: Other SMTP providers

Use your provider’s SMTP host, port (usually 587 for TLS), and your username/password. Set `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `server/.env`.

---

## Testing

1. Restart the server after changing env.
2. **Verification:** Sign up with a real email; the verification email is sent if Resend/SMTP is set; otherwise the link is printed in the server console.
3. **Password reset:** Use “Forgot password”; the reset link is sent (or logged) the same way.
4. **Send invoice:** Open an invoice → Send; the client receives the email if Resend/SMTP is set; otherwise the server logs that email is not configured.
