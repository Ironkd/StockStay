# SQLite Setup Complete ✅

Your app is now configured to use SQLite for local development.

## Current Configuration

- **Database**: SQLite (`server/dev.db`)
- **Provider**: `sqlite` in `prisma/schema.prisma`
- **Adapter**: `@prisma/adapter-better-sqlite3`

## To Start the Server

```bash
cd ~/inventory-app/server
npm run dev
```

The server should start successfully and connect to SQLite.

## If You Get "Too Many Open Files" Error

This is a macOS system limit issue. Fix it with:

```bash
# Check current limit
ulimit -n

# Increase limit (temporary)
ulimit -n 10240

# Then restart server
npm run dev
```

Or make it permanent by adding to `~/.zshrc`:
```bash
ulimit -n 10240
```

## Next Steps

1. **Start the server** - `npm run dev`
2. **Test login** - Go to `http://localhost:5173` and log in
3. **Your data** - All data is stored in `server/dev.db`

## For Production (Later)

When ready to deploy with Supabase:
- Use Prisma Accelerate (recommended)
- Or configure direct PostgreSQL connection
- Update `.env` with Supabase connection string
- Update `schema.prisma` to `provider = "postgresql"`
- Update `db.js` to use PostgreSQL adapter
