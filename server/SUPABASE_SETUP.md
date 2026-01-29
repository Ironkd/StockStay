# Supabase Setup Instructions

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click **"New Project"**
3. Fill in:
   - **Name**: `inventory-app` (or your choice)
   - **Database Password**: Create a strong password (⚠️ SAVE THIS!)
   - **Region**: Choose closest to you
4. Click **"Create new project"**
5. Wait 2-3 minutes for setup

## Step 2: Get Your Database Connection String

1. In your Supabase project dashboard, go to **Settings** → **Database**
2. Scroll down to **Connection string** section
3. Click on **"URI"** tab
4. Copy the connection string (looks like):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
5. **Replace `[YOUR-PASSWORD]`** with the password you created in Step 1
6. This is your `DATABASE_URL` - save it securely!

## Step 3: Update Local Environment

1. Update `server/.env` file:
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres"
   JWT_SECRET="your-secret-key-change-this"
   NODE_ENV=development
   PORT=3000
   ```

   Replace `YOUR_PASSWORD` and the URL with your actual Supabase connection string.

## Step 4: Generate Prisma Client for PostgreSQL

```bash
cd server
npm run db:generate
```

## Step 5: Create Database Schema in Supabase

```bash
npm run db:migrate
```

When prompted for a migration name, use: `init_postgresql`

This will create all tables in your Supabase database.

## Step 6: Migrate Your Data from SQLite to Supabase

```bash
npm run db:migrate:supabase
```

This will:
- Read all data from your local SQLite database
- Upload it to Supabase PostgreSQL
- Show you a summary

## Step 7: Test the Connection

Start your server:

```bash
npm run dev
```

Try logging in - your data should now be in Supabase!

## Step 8: Deploy to Cloud

Once everything works locally with Supabase:

1. **Deploy Backend** to Railway/Render/Fly.io
2. **Deploy Frontend** to Vercel/Netlify
3. Set `DATABASE_URL` environment variable in your hosting platform

---

## Troubleshooting

### "Connection refused" or "Cannot connect"
- Check your Supabase connection string is correct
- Make sure you replaced `[YOUR-PASSWORD]` with actual password
- Verify Supabase project is fully set up (wait a few minutes)

### "Schema not found" or migration errors
- Make sure you ran `npm run db:generate` first
- Then run `npm run db:migrate` to create tables

### Migration script fails
- Make sure local SQLite database exists (`server/dev.db`)
- Check DATABASE_URL is set correctly
- Verify Supabase project is active

---

## Next Steps After Setup

1. ✅ Test locally with Supabase
2. ✅ Deploy backend to cloud hosting
3. ✅ Deploy frontend to Vercel/Netlify
4. ✅ Set environment variables in hosting platform
5. ✅ Access your app from anywhere! 🎉
