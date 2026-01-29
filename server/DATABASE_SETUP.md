# Database Setup Instructions

## Step 1: Install Dependencies

```bash
cd server
npm install prisma @prisma/client
```

## Step 2: Set Up Environment

Create a `.env` file in the `server` directory (or copy from example):

```bash
cp prisma/.env.example .env
```

Or manually create `.env` with:
```env
DATABASE_URL="file:./dev.db"
```

## Step 3: Generate Prisma Client

```bash
npm run db:generate
```

## Step 4: Create Database Schema

```bash
npm run db:migrate
```

This will:
- Create the SQLite database file (`dev.db`)
- Create all tables based on the Prisma schema
- Generate the Prisma Client

## Step 5: Migrate Existing Data (if you have data.json)

**⚠️ IMPORTANT: Backup your data.json first!**

```bash
cp data.json data.json.backup
```

Then run the migration:

```bash
npm run db:migrate:json
```

This will:
- Read all data from `data.json`
- Import it into the database
- Show you a summary of what was migrated

## Step 6: Start the Server

The server will now use the database instead of the JSON file:

```bash
npm run dev
```

## Verify Everything Works

1. Check the database with Prisma Studio:
   ```bash
   npm run db:studio
   ```
   This opens a visual database browser at http://localhost:5555

2. Test the API endpoints - they should work exactly the same as before!

## Troubleshooting

### Database file location
The SQLite database will be created at `server/dev.db`

### If migration fails
- Make sure you have a backup of `data.json`
- Check that the database schema is created: `npm run db:migrate`
- Try running the migration again: `npm run db:migrate:json`

### Switch to PostgreSQL later
To use PostgreSQL instead of SQLite:

1. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Update `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/inventory_db"
   ```

3. Run migrations:
   ```bash
   npm run db:migrate
   npm run db:migrate:json
   ```

## What Changed?

- ✅ Data is now stored in a real database (SQLite)
- ✅ Better performance and reliability
- ✅ Supports concurrent users
- ✅ Can easily switch to PostgreSQL later
- ✅ All existing data is preserved (after migration)
