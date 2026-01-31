# Real verification emails (SMTP setup)

To send real verification emails when users sign up, set these in your **server `.env`** (copy from `server/.env.example` and fill in values).

## Required in `.env`

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

1. Restart the server after changing `.env`.
2. Sign up with a real email address.
3. If SMTP is configured, the verification email is sent; otherwise the link is printed in the server console.
