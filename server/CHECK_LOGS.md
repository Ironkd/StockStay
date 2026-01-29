# Check Server Logs

When you try to login, check your **server terminal** for these messages:

## What to Look For

### If you see:
```
[LOGIN] Attempting login for: your@email.com
[LOGIN] User found: No
[LOGIN] User not found - creating new user...
```

**Then:** User creation is failing. Check for database errors below.

### If you see:
```
[LOGIN] Attempting login for: your@email.com
[LOGIN] User found: Yes (your@email.com)
[LOGIN] Verifying password for existing user...
[LOGIN] Password valid: false
```

**Then:** Password hash mismatch. The user exists but password is wrong.

### If you see:
```
Login error: ECONNREFUSED
Error code: ECONNREFUSED
```

**Then:** Database connection is failing. Check Supabase project status.

## What Email/Password Are You Using?

Please share:
1. What email/password you're trying
2. What appears in the server terminal when you login
3. Any error messages

This will help me diagnose the exact issue!
