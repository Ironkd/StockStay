# PITR and backup recovery (NFR-9)

Stock Stay’s system of record is **Supabase Postgres** (staging and production). This runbook covers verifying backups / Point-in-Time Recovery (PITR) and practicing a **staging** restore. It does **not** authorize an unscheduled production restore.

Upstream docs: [Supabase Backups](https://supabase.com/docs/guides/platform/backups) · [PITR usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)

---

## What “good” looks like

| Goal | Target |
|------|--------|
| **RPO** (how much data you can lose) | Seconds with PITR; up to ~24h with daily backups only |
| **RTO** (how long restore takes) | Minutes to hours depending on DB size and WAL replay |
| **Scope** | Postgres data only — not Railway env secrets, Vercel, Stripe, or Storage buckets |

**PITR** is a **paid add-on** on Supabase Pro / Team / Enterprise (eligible compute). Enabling it starts WAL archiving from that moment — you cannot recover to a time **before** PITR was turned on. When PITR is on, Supabase typically stops separate daily backups in favor of PITR.

**Interim posture:** If PITR is not purchased yet, confirm **daily backups** exist for the project and schedule enabling PITR before public launch.

---

## Staging vs production

1. Always verify and dry-run on **staging** first.
2. Never practice restores on **production** without an explicit maintenance window and stakeholder approval.
3. Confirm the Supabase project you open matches that env’s Railway `DATABASE_URL` (host / project ref).

---

## Dashboard checks (each environment)

For **staging** and **production** Supabase projects:

1. Open the project in [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Database → Backups** (and **Point in Time** / add-ons if shown), or [Add-ons → PITR](https://supabase.com/dashboard/project/_/settings/addons?panel=pitr).
3. Record:
   - Plan tier (Free / Pro / …)
   - **Daily backups** available? Retention (e.g. 7 days on Pro)?
   - **PITR** enabled? Earliest and latest recovery points? Retention window?
4. If PITR is off: note whether daily backups are acceptable interim, and who will enable the add-on before launch.

---

## Verification checklist

Copy per environment. Fill after each review.

### Staging

| Step | Done | Notes |
|------|------|-------|
| Backup / PITR status confirmed in dashboard | ☐ | Window: ________ |
| Railway `DATABASE_URL` matches this Supabase project | ☐ | |
| Staging restore dry-run completed (see below) | ☐ | Date: ________ |
| `/api/health` + signup smoke after dry-run | ☐ | |

**Last verified (staging):** date ________ · operator ________

### Production

| Step | Done | Notes |
|------|------|-------|
| Backup / PITR status confirmed in dashboard | ☐ | Window: ________ |
| Railway `DATABASE_URL` matches this Supabase project | ☐ | |
| Prod restore dry-run (only if scheduled outage) | ☐ / N/A | |

**Last verified (production):** date ________ · operator ________

---

## Staging restore dry-run (preferred)

Goal: prove you can recover without touching prod traffic.

**Preferred approach (safest):** restore into a **new** Supabase project (or follow Supabase’s documented restore flow that does not overwrite staging until verified), then:

1. Point a temporary Railway (or local) `DATABASE_URL` at the restored DB.
2. Run `npx prisma migrate status` (expect migrations applied / in sync).
3. Hit `GET /api/health`.
4. Sign up / login smoke (or use an existing test user if data restored).
5. Tear down the temporary project when done; record outcome in the checklist above.

**In-place restore of staging** (overwrites staging DB): only if the team accepts staging downtime and data loss. Remove **read replicas** first if any exist. Expect the project to be unavailable during restore.

---

## Restore caveats

- App **JWT secrets**, Stripe keys, and env vars live on **Railway / Vercel** — a DB restore does not restore those.
- After restore, reconnect apps; rotate credentials if the incident involved compromise.
- Cannot recover to a timestamp before PITR was enabled.
- Coordinate with anyone using staging before a dry-run overwrite.

---

## Related

- [operations.md](operations.md) — env vars, AdminJS, tests, dependency hygiene
- [environments.md](environments.md) — staging/prod provisioning
- [support-data-deletion.md](support-data-deletion.md) — support deletion (not a backup substitute)
