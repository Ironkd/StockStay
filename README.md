## StockStay

Inventory and client billing for short-term rental property managers. React + TypeScript frontend, Express + Prisma API, Postgres.

### Features

- **Stock locations & catalogue** — supply items, SKUs, on-hand balances, receive/adjust
- **Replenish / return / transfer** — billable movements with ledger audit
- **Properties & clients** — billing destinations and contacts
- **Scheduled invoices** — draft generation, PDF/email send, CSV export
- **Teams & plans** — Free / Starter / Pro limits, invites, Stripe upgrades after signup
- **Platform admin** — AdminJS at `/admin` for support (allowlisted emails)
- **Ops** — Umami analytics (optional), in-app feedback, ToS/Privacy, support deletion runbook

### Documentation

| Doc | What it’s for |
|-----|----------------|
| [docs/operations.md](docs/operations.md) | **Start here for ops:** all env vars, new environments, AdminJS, plan limits, Umami, feedback, deletion |
| [docs/pitr-recovery.md](docs/pitr-recovery.md) | Supabase PITR / backup verification |
| [docs/test-matrix.md](docs/test-matrix.md) | Section 8 user-story → automated test map |
| [docs/environments.md](docs/environments.md) | Staging/production provisioning checklist (Supabase, Railway, Vercel, Stripe) |
| [docs/requirements.md](docs/requirements.md) | Product requirements (source of truth) |
| [docs/support-data-deletion.md](docs/support-data-deletion.md) | How support deletes/anonymizes accounts |
| [STILL_TO_DO.md](STILL_TO_DO.md) | Post-deploy go-live checklist |
| [SETUP.md](SETUP.md) | Older macOS setup notes (prefer Quick Start + operations.md) |

### Getting started (local)

1. **Postgres** (Docker, host port **5433**):

   ```bash
   docker compose up -d
   ```

2. **Env files:**

   ```bash
   cp .env.example .env
   cp server/.env.example server/.env
   ```

3. **API** (Terminal 1):

   ```bash
   cd server
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm run dev
   ```

   Default: `http://localhost:3000` (set `PORT` if needed).

4. **Frontend** (Terminal 2):

   ```bash
   npm install
   npm run dev
   ```

   Open `http://localhost:5173` → **Sign up** (Free plan; no payment). Without email configured, verification links appear in the API console.

Full variable reference: **[docs/operations.md §2](docs/operations.md#2-environment-variables-complete)**.

### Common operator tasks

| Task | Where |
|------|--------|
| Set up staging/prod | [docs/environments.md](docs/environments.md) |
| Enable AdminJS | `SUPER_ADMIN_EMAILS` + open `{API}/admin` — [ops §4](docs/operations.md#4-platform-admin-adminjs) |
| Change Free/Starter/Pro caps | Edit `server/plan-limits.json`, restart API — [ops §5](docs/operations.md#5-plan-limits) |
| Turn on analytics | `VITE_UMAMI_*` on frontend — [ops §6](docs/operations.md#6-analytics-umami-cloud) |
| Handle deletion request | [docs/support-data-deletion.md](docs/support-data-deletion.md) |
| Configure email / Stripe | `server/EMAIL_SETUP.md`, `server/STRIPE_SETUP.md` |

### Backend API (high level)

Authenticated requests need `Authorization: Bearer <token>` (except public auth/plans).

#### Auth
- `POST /api/auth/signup` – Free account (no payment)
- `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/auth/me`

#### Plans
- `GET /api/plans` – Public live plan limits (marketing)
- `GET /api/team/limits` – Usage vs plan for the active team

#### Stock & catalogue
- `GET/POST /api/stock-locations`, `GET/POST /api/supply-items`, `GET/POST /api/skus`
- Receive / adjust via stock ledger routes; low-stock: `GET /api/location-low-stock`

#### Replenishment
- `POST /api/replenishments`, returns, transfers; unbilled lines feed invoices

#### Clients & invoices
- `GET/POST /api/clients`, `GET/POST /api/invoices`
- `POST /api/billing/generate-drafts`, `POST /api/invoices/:id/send`, CSV export

#### Platform admin
- `GET /admin` – AdminJS (disabled/404 unless `SUPER_ADMIN_EMAILS` is set)

Compat redirects: frontend `/inventory` and `/sales` → `/stock`.

### Build for production

```bash
npm run build
npm run preview
```

### Running tests

**Frontend** (Vitest + Testing Library):

```bash
npm test -- --run
```

**Backend** (Vitest + Supertest against Postgres `stockstay_test`):

```bash
docker compose up -d
cd server
npm install --include=dev   # required: server/.npmrc omits devDeps for prod
npm test
```

Story coverage map: [docs/test-matrix.md](docs/test-matrix.md). Playwright E2E is deferred.
