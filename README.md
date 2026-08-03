## StockStay

Inventory and client billing for short-term rental property managers. React + TypeScript frontend, Express + Prisma API, Postgres.

### Features

- **Stock locations & catalogue** — supply items, SKUs, on-hand balances, receive/adjust
- **Replenish / return / transfer** — billable movements with ledger audit
- **Properties & clients** — billing destinations and contacts
- **Scheduled invoices** — draft generation, PDF/email send, CSV export
- **Teams & plans** — Free / Starter / Pro limits, invites, Stripe upgrades after signup

### Getting started

**📋 See [SETUP.md](./SETUP.md) for detailed step-by-step instructions.**

#### Quick Start

1. **Start local Postgres** (Docker):

   ```bash
   docker compose up -d
   ```

2. **Install Frontend Dependencies:**
   ```bash
   npm install
   cp .env.example .env
   ```

3. **Install Backend Dependencies:**
   ```bash
   cd server
   npm install
   cp .env.example .env
   npx prisma generate
   npx prisma migrate deploy
   cd ..
   ```

4. **Start Backend Server** (Terminal 1):
   ```bash
   cd server
   npm run dev
   ```
   Server runs on `http://localhost:3000` (or `PORT` from `server/.env`)

5. **Start Frontend** (Terminal 2 - new terminal):
   ```bash
   npm run dev
   ```
   Frontend runs on `http://localhost:5173`

6. **Sign up** at `http://localhost:5173` (Free plan; no payment required).

See **[docs/environments.md](docs/environments.md)** for local / staging / production separation.

The `.env` file should point the frontend at your local API (default `http://localhost:3000/api`).

### Environment variables

**Frontend** (root `.env`):
- `VITE_API_BASE_URL` – Backend API URL (e.g. `http://localhost:3000/api` for local).

**Backend** (`server/.env`): copy from `server/.env.example`.
- `APP_ENV` – `local`, `staging`, or `production`.
- `PORT` – Server port (default 3000).
- `NODE_ENV` – `development` or `production`.
- `JWT_SECRET` – **Required when `APP_ENV` is staging or production.**
- `DATABASE_URL` – PostgreSQL connection string (Docker local or Supabase).
- `CORS_ORIGIN` – Frontend origin(s) for CORS.

### Backend API (high level)

All authenticated requests need `Authorization: Bearer <token>` (except public auth/plans).

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

Compat redirects: frontend `/inventory` and `/sales` → `/stock`.

### Build for production

```bash
npm run build
npm run preview
```

### Running tests

```bash
npm install
npm test
```

See `docs/` and `SETUP.md` for more.
