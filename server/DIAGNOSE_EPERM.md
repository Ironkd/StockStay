# Diagnosing EPERM Error

Your tables exist (✅ confirmed from screenshot), but Prisma queries fail with `EPERM`.

## Check Team Table Columns

Run this in Supabase SQL Editor:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'Team'
ORDER BY ordinal_position;
```

**You should see:**
- `id`
- `name`
- `ownerId`
- `createdAt`
- `updatedAt`
- `plan` ← **Check if this exists**
- `maxWarehouses` ← **Check if this exists**

## If `plan` and `maxWarehouses` Don't Exist

Run the SQL migration:
1. Open `server/create-warehouse-table.sql`
2. Copy all SQL
3. Run in Supabase SQL Editor

## If Columns Exist But Still Getting EPERM

This might be a Session Pooler limitation. Try:

1. **Use Transaction Pooler** (port 5432) - it worked for pool test
2. Update `.env` to:
   ```
   DATABASE_URL="postgresql://postgres.pumfndlkhghbsipzejgd:FV3rDzYZRs2pPp3e@aws-1-ca-central-1.pooler.supabase.com:5432/postgres"
   ```
3. Restart server

**Check the Team table columns first** - that's most likely the issue!
