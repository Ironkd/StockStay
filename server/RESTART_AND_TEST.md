# Restart Server with Session Pooler

I've updated `.env` with the Session Pooler connection string you provided.

## Restart Your Server

Stop your current server (Ctrl+C), then:

```bash
cd ~/inventory-app/server
NODE_ENV=development node server.js
```

## What to Watch For

1. **Connection message:**
   - `🔌 Connecting to Supabase...`
   - `✅ Database pool connected successfully` ← Good sign!

2. **Demo user initialization:**
   - If you see: `⚠️ Could not initialize demo user` → That's OK, tables might not exist yet
   - If you see: `✅ Demo user initialized` → Perfect!

3. **Try logging in:**
   - Go to `http://localhost:5173`
   - Try: `test@example.com` / `test123`

## If Login Still Fails

The `ECONNREFUSED` error might mean:
1. **Tables don't exist yet** → Run the SQL migration in Supabase
2. **Session Pooler still has issues** → Try Transaction Pooler again

## Check: Did You Run SQL Migration?

Make sure you've run `create-warehouse-table.sql` in Supabase SQL Editor. This creates:
- `Warehouse` table
- `plan` and `maxWarehouses` columns on `Team` table

Restart your server and let me know what happens!
