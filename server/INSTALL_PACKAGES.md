# Install Required Packages

When your network connection is working, run this command from the `server` directory:

```bash
cd ~/inventory-app/server
npm install @prisma/adapter-pg pg
```

## After Installation

Once the packages are installed, test the connection:

```bash
node test-supabase-connection.js
```

You should see:
- ✅ Connected to Supabase!
- Data counts for all your tables
- Sample user information

## Then Start Your App

1. **Backend:**
   ```bash
   cd ~/inventory-app/server
   npm run dev
   ```

2. **Frontend** (in a new terminal):
   ```bash
   cd ~/inventory-app
   npm run dev
   ```

3. **Login** at `http://localhost:5173` with:
   - Email: `demo@example.com`
   - Password: `demo123`

## Current Status

✅ Database tables created in Supabase
✅ Data migrated to Supabase
✅ Code updated to use PostgreSQL adapter
⏳ Waiting for package installation (network issue)

Once packages are installed, everything will work!
