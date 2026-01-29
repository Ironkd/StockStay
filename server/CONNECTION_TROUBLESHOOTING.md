# Connection Troubleshooting

## Current Error: ECONNREFUSED

`ECONNREFUSED` means the connection is being **refused** by the server. This is different from DNS issues.

## Possible Causes

### 1. Supabase Project Paused
- Go to https://supabase.com/dashboard
- Check if project status is **"Active"** (green)
- If paused → click **"Restore"** or **"Resume"**

### 2. Wrong Connection String
- Verify connection string in Supabase dashboard
- Settings → Database → Connection string
- Make sure you're using the **"URI"** tab (not Connection Pooling)

### 3. Port Blocked
- Port 5432 might be blocked by firewall
- Try using port 6543 (Session Pooler) instead

### 4. SSL Configuration
- Supabase requires SSL
- The code is configured for SSL, but verify connection string includes `?sslmode=require`

## Quick Fixes

### Try Session Pooler (Port 6543)

Update your `.env` with Session Pooler connection string:

1. Go to Supabase Dashboard
2. Settings → Database → Connection Pooling
3. Copy **Session mode** connection string
4. Update `.env` file

### Check Project Status

1. Go to https://supabase.com/dashboard
2. Find your project
3. If it says "Paused" → click "Restore"
4. Wait 1-2 minutes for it to become active

### Test Connection Manually

Try connecting with a database client:
- TablePlus
- DBeaver  
- pgAdmin
- Or Supabase's built-in SQL Editor

If those work, the connection string is correct and it's a code/network issue.

## What I've Fixed

✅ Added better error handling
✅ Made demo user initialization non-blocking
✅ Added connection timeout
✅ Better error messages

The server will now continue running even if database connection fails initially. Try logging in - it might work!
