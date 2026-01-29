# Prisma Accelerate Setup for Supabase

Prisma Accelerate solves the connection pooler issues we've been experiencing. It's free for development!

## Steps:

1. **Install Prisma Accelerate extension:**
   ```bash
   npm install @prisma/extension-accelerate
   ```

2. **Sign up for Prisma Accelerate (free tier):**
   - Go to https://console.prisma.io/
   - Sign up/login
   - Create a new project
   - Select "Accelerate"
   - Paste your Supabase connection string:
     ```
     postgresql://postgres:FV3rDzYZRs2pPp3e@db.pumfndlkhghbsipzejgd.supabase.co:5432/postgres
     ```
   - Select closest region (probably US East or similar)
   - Click "Create project" and "Enable Accelerate"
   - Copy the `prisma://accelerate.prisma.io/...` connection URL

3. **Update `.env` with the Accelerate URL:**
   ```
   DATABASE_URL="prisma://accelerate.prisma.io/..."
   ```

4. **Update `db.js` to use Accelerate extension**

Let me know when you have the Accelerate URL and I'll update the code!
