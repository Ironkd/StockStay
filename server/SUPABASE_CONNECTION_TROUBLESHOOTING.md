# Supabase Connection Troubleshooting

## Common Issues

### 1. "Can't reach database server"

**Possible causes:**
- Supabase project is still initializing (wait 2-3 minutes)
- Wrong connection string
- Network/firewall blocking connection
- Need to use connection pooler instead

### 2. Check Your Supabase Project Status

1. Go to your Supabase dashboard
2. Check if project status is **"Active"** (green)
3. If it says "Setting up" or "Paused", wait or restart it

### 3. Verify Connection String

In Supabase dashboard:
1. Go to **Settings** → **Database**
2. Scroll to **Connection string** section
3. Make sure you're using the **"URI"** tab (not Session mode)
4. Copy the exact string shown
5. Replace `[YOUR-PASSWORD]` with your actual password

### 4. Try Connection Pooler

If direct connection (port 5432) doesn't work, try the pooler (port 6543):

In your `.env` file, change:
```env
# From:
DATABASE_URL="postgresql://...@db.xxxxx.supabase.co:5432/postgres?sslmode=require"

# To:
DATABASE_URL="postgresql://...@db.xxxxx.supabase.co:6543/postgres?sslmode=require"
```

The pooler connection string is also in Supabase dashboard under **Connection string** → **Connection Pooling** tab.

### 5. Test Connection Manually

You can test the connection using `psql` (if installed):
```bash
psql "postgresql://postgres:YOUR_PASSWORD@db.pumfndlkhghbsipzejgd.supabase.co:5432/postgres?sslmode=require"
```

Or use a database client like:
- TablePlus
- DBeaver
- pgAdmin

### 6. Check Supabase Project Settings

- Make sure your project is in the correct region
- Check if there are any IP restrictions enabled
- Verify the database password is correct

---

## Next Steps

Once connection works:
1. Run `npm run db:generate`
2. Run `npm run db:migrate`
3. Run `npm run db:migrate:supabase`

Let me know what error you're seeing and we can troubleshoot!
