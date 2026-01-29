# Inventory App Backend Server

Express.js backend server for the StockStay application.

## Features

- RESTful API endpoints for inventory, clients, and invoices
- JWT-based authentication
- File-based data storage (JSON)
- CORS enabled for frontend integration

## Installation

```bash
cd server
npm install
```

## Running the Server

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will start on `http://localhost:3000` by default.

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Inventory
- `GET /api/inventory` - Get all items
- `GET /api/inventory/:id` - Get item by ID
- `POST /api/inventory` - Create item
- `POST /api/inventory/bulk` - Bulk create items
- `PUT /api/inventory/:id` - Update item
- `DELETE /api/inventory/:id` - Delete item
- `DELETE /api/inventory` - Delete all items

### Clients
- `GET /api/clients` - Get all clients
- `GET /api/clients/:id` - Get client by ID
- `POST /api/clients` - Create client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Invoices
- `GET /api/invoices` - Get all invoices
- `GET /api/invoices/:id` - Get invoice by ID
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice

## Demo Credentials

- Email: `demo@example.com`
- Password: `demo123`

Or use any email/password combination (for demo purposes).

## Data Storage

Data is stored in `server/data.json`. This file is automatically created on first run.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `JWT_SECRET` - Secret key for JWT tokens (default: "your-secret-key-change-in-production")

**Important**: Change the JWT_SECRET in production!
