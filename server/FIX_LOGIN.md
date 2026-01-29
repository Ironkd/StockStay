# Fix Login Issue

You're getting "invalid credentials" which means:
✅ **Connection to Supabase is working!**
❌ Password hash doesn't match

## Quick Fix Options

### Option 1: Create a New User (Easiest)

Just use a different email/password combination. The app will create a new user automatically:

- Email: `test@example.com`
- Password: `test123`

Or any email/password you want!

### Option 2: Reset Password via SQL

1. Go to Supabase Dashboard → SQL Editor
2. Run this SQL:

```sql
-- Check current user
SELECT id, email, name FROM "User" WHERE email = 'demo@example.com';

-- Delete the old user (if exists)
DELETE FROM "User" WHERE email = 'demo@example.com';

-- Delete the team (if exists)  
DELETE FROM "Team" WHERE name = 'Demo Team';
```

3. Restart your server - it will create a new demo user with correct password hash

### Option 3: Use Any Email/Password

The app creates new users automatically! Just use:
- Any email (e.g., `myemail@test.com`)
- Any password (e.g., `mypassword`)

The app will create a new user and team for you.

## Why This Happened

When we migrated data from SQLite to Supabase, the password hash might have been corrupted or encoded differently. The easiest solution is to create a new user or let the app create one automatically.
