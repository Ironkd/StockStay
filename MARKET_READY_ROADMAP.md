# StockStay: Roadmap to Market-Ready

You’re on **Supabase (PostgreSQL)** with teams, warehouses, inventory, clients, invoices, and a landing page with pricing. Here’s what’s left to make the app **marketable and safe for real users**.

---

## 1. Security (Do First)

**Current gaps**

- JWT secret can fall back to a default in code.
- No rate limiting (brute-force risk on login).
- No security headers (e.g. Helmet).
- No request validation/sanitization.

**Actions**

| Task | Effort | Notes |
|------|--------|--------|
| **Require `JWT_SECRET` in production** | Small | In `server.js`, if `NODE_ENV=production` and no `JWT_SECRET`, refuse to start. |
| **Add rate limiting** | Small | e.g. `express-rate-limit` on `/api/auth/login` (e.g. 5–10 attempts per 15 min per IP). |
| **Add Helmet** | Small | `helmet()` for secure headers. |
| **Add input validation** | Medium | Use `express-validator` (or similar) on login and key APIs (inventory, clients, etc.). |
| **Tighten CORS** | Small | In production, set `CORS_ORIGIN` to your real frontend origin(s) only. |

**Outcome:** Login and API are harder to abuse; you avoid leaking secrets and common header issues.

---

## 2. Auth & Onboarding

**Current state**

- “Sign up” and “Sign in” both hit the same login endpoint; new users are auto-created (good for MVP).
- “Forgot password” is UI-only; no email is sent.

**Actions**

| Task | Effort | Notes |
|------|--------|--------|
| **Optional: dedicated signup** | Small | If you want “Sign up” to require name/email/password and then call a `POST /api/auth/signup` that creates user + team. Keeps login for returning users only. |
| **Password reset (real)** | Medium | Backend: store reset token + expiry (e.g. in DB or Redis). Endpoint e.g. `POST /api/auth/forgot-password` (sends email) and `POST /api/auth/reset-password` (token + new password). Use Supabase Auth or a provider (Resend, SendGrid, etc.) for email. |
| **Email verification (optional)** | Medium | Send verification link on signup; optional “verified” flag on `User`. Can come after launch. |
| **Password rules** | Small | Enforce min length and basic strength on signup/reset; show rules in UI. |

**Outcome:** Real signup, real password reset, and clearer onboarding.

---

## 3. Legal & Trust (Required for “Marketable”)

**Actions**

| Task | Effort | Notes |
|------|--------|--------|
| **Terms of Service** | Small–Medium | Page at `/terms` (or `/legal/terms`). Link in footer and signup. |
| **Privacy Policy** | Small–Medium | Page at `/privacy`. Describe what you store (email, team data, inventory), how you use it, and that Supabase is your DB/backend. Link in footer and signup. |
| **Cookie / consent (if needed)** | Small | If you add analytics or non-essential cookies later, add a simple banner and link to privacy. |

**Outcome:** You can say “Sign up” and “Get Started” without missing expected legal pages.

---

## 4. Pricing & Billing (Align with Landing Page)

**Current state**

- Landing page shows **Free** (1 warehouse, etc.) and **Pro** ($29/mo).
- Backend has `Team.plan` and `Team.maxWarehouses` but no enforcement or billing.

**Actions**

| Task | Effort | Notes |
|------|--------|--------|
| **Enforce plan limits** | Medium | When creating a warehouse, check `team.plan` and `team.maxWarehouses`; reject if over limit. Same for any other plan-limited features. |
| **Collect payment (Pro)** | Medium–High | Integrate Stripe (or similar): checkout, webhooks, sync subscription status to `Team.plan` and `Team.maxWarehouses`. |
| **Or: “Coming soon”** | Small | Keep current behavior; change “Upgrade to Pro” to “Pro plan coming soon” and add a waitlist or contact link. |

**Outcome:** Either real paid plans or an honest “coming soon” so the site matches reality.

---

## 5. Deployment & Environment

**Actions**

| Task | Effort | Notes |
|------|--------|--------|
| **Deploy backend** | Small | e.g. Railway, Render, or Fly.io. Set `DATABASE_URL` (Supabase), `JWT_SECRET`, `NODE_ENV=production`, `CORS_ORIGIN=https://yourdomain.com`. |
| **Deploy frontend** | Small | e.g. Vercel, Netlify, Cloudflare Pages. Set `VITE_API_BASE_URL` to your backend API URL. |
| **Custom domain + HTTPS** | Small | Use the platform’s DNS/SSL (usually automatic). |
| **Env docs** | Small | Update `.env.example` (and README) with every required variable for local and production. |

**Outcome:** One live URL for app and one for API, both over HTTPS.

---

## 6. UX & Polish

**Actions**

| Task | Effort | Notes |
|------|--------|--------|
| **Error handling** | Small | Global API error handler; show user-friendly messages in UI (e.g. “Something went wrong”, “Session expired”). |
| **Loading states** | Small | Skeletons or spinners on dashboard, inventory, clients, invoices. |
| **Empty states** | Small | “No inventory yet — add your first item” with clear CTA. Same for clients, invoices. |
| **Onboarding** | Medium | After first login, optional short flow: “Create your first warehouse” → “Add your first item”. |
| **Mobile** | Small–Medium | Check landing and app on small screens; fix layout and tap targets. |

**Outcome:** App feels solid and guided, not broken or empty.

---

## 7. Monitoring & Support

**Actions**

| Task | Effort | Notes |
|------|--------|--------|
| **Error tracking** | Small | e.g. Sentry for backend and frontend. |
| **Uptime** | Small | e.g. UptimeRobot or Better Stack to ping your API and frontend. |
| **Support channel** | Small | Contact email or “Help” link in app and footer; optional in-app chat later. |

**Outcome:** You know when things break and where users can ask for help.

---

## Suggested Order

1. **Security** (JWT, rate limit, Helmet, CORS) — ~1 day  
2. **Legal** (Terms + Privacy pages and footer links) — ~1 day  
3. **Deployment** (backend + frontend + env) — ~0.5–1 day  
4. **Plan enforcement** (warehouse limits for Free) — ~0.5 day  
5. **Password reset** (real email flow) — ~1 day  
6. **UX polish** (errors, loading, empty states) — ongoing  
7. **Billing** (Stripe) or “Pro coming soon” — when you’re ready to charge  

---

## Quick Wins You Can Do Right Now

- In `server.js`: require `JWT_SECRET` when `NODE_ENV=production`; add `express-rate-limit` and `helmet`.
- Add `/terms` and `/privacy` routes with simple static content; link them in the landing footer (and login/signup if you have them).
- Update README and `.env.example` with: `JWT_SECRET`, `CORS_ORIGIN`, `DATABASE_URL`, `VITE_API_BASE_URL`, and that they’re required in production.

If you tell me your priority (e.g. “security first” or “deploy first”), I can outline exact code changes and file edits next.
