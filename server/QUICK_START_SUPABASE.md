# Quick Start: Connect to Supabase

## ⚠️ Important: Replace Password

Your `.env` file has been updated with your Supabase connection string, but you need to:

1. **Replace `[YOUR-PASSWORD]`** with your actual Supabase database password
   - This is the password you created when setting up the Supabase project
   - Open `server/.env` and replace `[YOUR-PASSWORD]` with your real password

2. The connection string should look like:
   ```
   DATABASE_URL="postgresql://postgres:your-actual-password@db.pumfndlkhghbsipzejgd.supabase.co:5432/postgres"
   ```

## Next Steps

Once you've updated the password in `.env`:

### Step 1: Generate Prisma Client for PostgreSQL
```bash
cd server
npm run db:generate
```

### Step 2: Create Tables in Supabase
```bash
npm run db:migrate
```
When prompted, name the migration: `init_postgresql`

### Step 3: Migrate Your Data
```bash
npm run db:migrate:supabase
```
This moves all your data from local SQLite to Supabase.

### Step 4: Test It
```bash
npm run dev
```
Then try logging in - your data should be in Supabase now!

---

## Need Help?

If you get errors:
- Make sure the password in `.env` is correct (no brackets)
- Verify your Supabase project is fully set up
- Check the connection string format

Let me know when you've updated the password and we can run the migrations!
