## StockStay

A full-featured inventory management web app built with React and TypeScript. The app connects to a backend API for data persistence.

### Features

- **Multi-page application**: Login, Home dashboard, Inventory, Clients, Invoices, and Settings pages
- **Authentication**: Secure login with JWT token-based authentication
- **Inventory Management**: Add, edit, delete, and search inventory items
- **Client Management**: Manage client contacts and information
- **Invoice Management**: Create and manage invoices with line items
- **Dashboard**: Visual charts and graphs showing inventory statistics
- **Smart status**: Items are automatically marked as **In stock**, **Low stock**, or **Out of stock** based on quantity and reorder point
- **Data export**: Export inventory data as JSON files

### Getting started

**📋 See [SETUP.md](./SETUP.md) for detailed step-by-step instructions.**

#### Quick Start

1. **Install Frontend Dependencies:**
   ```bash
   npm install
   ```

2. **Install Backend Dependencies:**
   ```bash
   cd server
   npm install
   cd ..
   ```

3. **Start Backend Server** (Terminal 1):
   ```bash
   cd server
   npm run dev
   ```
   Server runs on `http://localhost:3000`

4. **Start Frontend** (Terminal 2 - new terminal):
   ```bash
   npm run dev
   ```
   Frontend runs on `http://localhost:5173`

5. **Login:**
   - Open `http://localhost:5173`
   - Email: `demo@example.com`
   - Password: `demo123`
   - Or use any email/password (demo mode)

The `.env` file is already configured to point to `http://localhost:3000/api`.

### Environment variables

**Frontend** (root `.env`):
- `VITE_API_BASE_URL` – Backend API URL (e.g. `http://localhost:3000/api` for dev).

**Backend** (`server/.env`): copy from `server/.env.example`.
- `PORT` – Server port (default 3000).
- `NODE_ENV` – `development` or `production`.
- `JWT_SECRET` – **Required in production.** Set a long random string; the server will not start in production without it.
- `DATABASE_URL` – PostgreSQL connection string (e.g. Supabase).
- `CORS_ORIGIN` – In production, set to your frontend origin (e.g. `https://app.stockstay.com`) for secure CORS.

### Backend API Requirements

The app expects a REST API with the following endpoints:

#### Authentication
- `POST /api/auth/login` - Login with email and password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

#### Inventory
- `GET /api/inventory` - Get all inventory items
- `GET /api/inventory/:id` - Get inventory item by ID
- `POST /api/inventory` - Create inventory item
- `PUT /api/inventory/:id` - Update inventory item
- `DELETE /api/inventory/:id` - Delete inventory item
- `DELETE /api/inventory` - Delete all inventory items
- `POST /api/inventory/bulk` - Bulk create inventory items

#### Clients
- `GET /api/clients` - Get all clients
- `GET /api/clients/:id` - Get client by ID
- `POST /api/clients` - Create client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

#### Invoices
- `GET /api/invoices` - Get all invoices
- `GET /api/invoices/:id` - Get invoice by ID
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice

All API requests require a Bearer token in the Authorization header (except login).

### Build for production

```bash
npm run build
npm run preview
```

### Running tests

1. Install dependencies (if not already done):
```bash
npm install
```

2. Run tests:
```bash
npm test
```

3. Run tests with UI (interactive):
```bash
npm run test:ui
```

4. Run tests with coverage:
```bash
npm run test:coverage
```
