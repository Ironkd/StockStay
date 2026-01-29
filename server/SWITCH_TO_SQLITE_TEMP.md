# Temporary Switch to SQLite

Since Supabase pooler connections are having persistent issues with Prisma 7, let's temporarily switch back to SQLite so you can continue development. We'll set up Supabase properly for production later.

## Quick Switch:

1. **Update `.env`:**
   ```
   DATABASE_URL="file:./dev.db"
   ```

2. **Update `schema.prisma`:**
   Change `provider = "postgresql"` to `provider = "sqlite"`

3. **Restart server:**
   ```bash
   npm run dev
   ```

This will let you continue working while we figure out the Supabase connection issue.

**Would you like me to make this switch now?**
