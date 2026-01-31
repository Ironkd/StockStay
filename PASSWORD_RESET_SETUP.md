# Password Reset Setup

The app supports real password reset via email. Here’s what’s implemented and how to configure it.

---

## What’s Implemented

1. **Forgot password (login page)**  
   User enters email → backend creates a one-time token (1 hour expiry), stores it in the DB, and sends an email with a link to `/reset-password?token=...`.

2. **Reset password page**  
   User opens the link → enters new password (min 8 chars) and confirms → backend validates token, updates password, invalidates token → user is redirected to login with a success message.

3. **Security**  
   - Rate limit on forgot-password (5 requests per 15 min per IP).  
   - Token is single-use and expires in 1 hour.  
   - Same success message whether the email exists or not (no email enumeration).

---

## Backend env vars (server)

In **Railway** (or your server env), set:

| Variable | Required | Description |
|----------|----------|-------------|
| **APP_URL** | Yes (for email link) | Frontend base URL, e.g. `https://stockstay.com`. Used to build the reset link in the email. No trailing slash. |
| **RESEND_API_KEY** | Yes (to send email) | API key from [resend.com](https://resend.com). Without this, the reset link is only logged to the server console (useful for local dev). |
| **RESEND_FROM_EMAIL** | Optional | From address for the email, e.g. `Stock Stay <noreply@stockstay.com>`. Must be a verified domain in Resend, or use `onboarding@resend.dev` for testing. |

---

## Database migration

The backend uses a **PasswordResetToken** table. Apply the migration once:

```bash
cd server
npx prisma migrate deploy
```

(Locally with Supabase: ensure `DATABASE_URL` in `server/.env` points to your DB, then run the same command.)

---

## Resend setup (production email)

1. Sign up at [resend.com](https://resend.com).  
2. Create an API key (Dashboard → API Keys).  
3. Add **RESEND_API_KEY** to your server env (e.g. Railway Variables).  
4. To send from your own domain (e.g. `noreply@stockstay.com`):  
   - In Resend, add and verify your domain (e.g. stockstay.com).  
   - Set **RESEND_FROM_EMAIL** = `Stock Stay <noreply@stockstay.com>`.  
5. For testing you can use the default Resend from address (`onboarding@resend.dev`) without verifying a domain.

---

## Flow summary

1. User clicks “Forgot password?” on the login page.  
2. User enters email and submits.  
3. Backend: if user exists, create token, save to DB, send email via Resend (or log link if no API key).  
4. User receives email with link: `https://stockstay.com/reset-password?token=xxx`.  
5. User clicks link, enters new password and confirmation, submits.  
6. Backend: validate token, update password, delete token, return success.  
7. User is redirected to login and can sign in with the new password.
