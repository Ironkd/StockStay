# Verify Tables Exist

The `EPERM` error suggests tables might not exist or there's a permissions issue.

## Check Tables in Supabase

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Copy and run this SQL:

```sql
-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**You should see:**
- `User`
- `Team`
- `Warehouse`
- `Inventory`
- `Client`
- `Invoice`
- `Sale`
- `Invitation`

## If Tables Don't Exist

Run the SQL migration:
1. Open `server/create-warehouse-table.sql`
2. Copy all SQL
3. Run in Supabase SQL Editor

## If Tables Exist But Still Getting EPERM

This might be a Session Pooler limitation. Try:
1. Get the **Transaction Pooler** connection string again
2. Or check Supabase project permissions

**Share what tables you see** when you run the SQL check!
