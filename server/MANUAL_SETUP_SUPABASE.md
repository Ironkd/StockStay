# Manual Supabase Setup (Workaround)

Since Prisma migrations are having connection issues, we can set up the tables manually:

## Step 1: Create Tables in Supabase

1. Go to your Supabase dashboard
2. Click on **SQL Editor** (in the left sidebar)
3. Open the file `create-tables-manually.sql` I just created
4. Copy all the SQL from that file
5. Paste it into the SQL Editor
6. Click **Run** (or press Cmd+Enter)

This will create all the tables in your Supabase database.

## Step 2: Verify Tables Created

In Supabase SQL Editor, run:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see: Client, Inventory, Invoice, Invitation, Sale, Team, User

## Step 3: Migrate Data

Once tables are created, we can run the data migration script. But first, we need to fix the Prisma connection issue.

## Alternative: Wait and Retry

The IPv4 addon might need a few more minutes to fully activate. You could:
1. Wait 5-10 minutes
2. Try `npm run db:migrate` again

Let me know which approach you prefer!
