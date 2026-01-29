# Try Session Pooler Instead

The Transaction Pooler might not support all Prisma operations. Let's try Session Pooler:

## Get Session Pooler Connection String

1. Go to **Supabase Dashboard** → **Connect** → **Connection Pooling**
2. Select **"Session mode"** (not Transaction mode)
3. Copy the connection string
4. Share it here and I'll update `.env`

Or if you see it, it should look like:
```
postgresql://postgres.pumfndlkhghbsipzejgd:PASSWORD@aws-0-ca-central-1.pooler.supabase.com:6543/postgres
```

Note the **port 6543** (Session mode) vs port 5432 (Transaction mode).

## Why This Matters

- **Transaction Pooler (port 5432)**: Fast but limited - doesn't support all PostgreSQL features
- **Session Pooler (port 6543)**: More compatible - supports all Prisma operations

Let me know the Session Pooler connection string!
