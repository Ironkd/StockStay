# Get Supabase Session Pooler Connection String

## Steps:

1. In your Supabase dashboard, go to **Settings** → **Database**
2. Scroll down to **Connection Pooling** section
3. Click on **"Session mode"** tab
4. Copy the connection string shown (it will look different from the direct connection)
5. Replace `[YOUR-PASSWORD]` with your actual password
6. Update your `.env` file with that connection string

The pooler connection string typically looks like:
```
postgresql://postgres.xxxxx:password@aws-0-region.pooler.supabase.com:6543/postgres
```

Or it might use a different format. Just copy exactly what Supabase shows you.

Once you have the pooler connection string, update `server/.env` and we can try the migration again!
