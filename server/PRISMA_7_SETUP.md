# Prisma 7 Setup Instructions

Prisma 7 requires a driver adapter for SQLite. Here's how to complete the setup:

## Step 1: Install Required Packages

Once your network connection is working, run:

```bash
cd server
npm install better-sqlite3 @prisma/adapter-better-sqlite3
```

## Step 2: Run the Migration

After installing the packages, run:

```bash
npm run db:migrate:json
```

This will migrate all your data from `data.json` to the database.

## Step 3: Start the Server

```bash
npm run dev
```

## What Changed

The code has been updated to use the `better-sqlite3` adapter which is required by Prisma 7 for SQLite databases. The adapter is configured in:
- `server/db.js` - Main database connection
- `server/migrate-from-json.js` - Migration script

Both files now use:
```javascript
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database(dbPath);
const adapter = new PrismaBetterSqlite3(sqlite);
const prisma = new PrismaClient({ adapter });
```

## Alternative: Use Prisma 6

If you prefer to avoid the adapter requirement, you can downgrade to Prisma 6:

```bash
npm install prisma@6 @prisma/client@6
```

Then revert the schema to include the `url` property:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

And remove the adapter code from `db.js` and `migrate-from-json.js`.
