# Fix Login Issue

"Invalid credentials" means the server found your account but the password didn't match.

## Quick Fix: Use Forgot Password

1. On the login page, click **Forgot password**.
2. Enter your email and submit.
3. Check your inbox for the reset link (check spam if needed).
4. Set a new password and log in with that.

This fixes wrong or corrupted password hashes (e.g. after migration).

## Other Options

### Case-insensitive email

Login now looks up your account by email **case-insensitively**. So `You@Example.com` and `you@example.com` both find the same user. If you still get "Invalid credentials", use Forgot password above.

### Reset password via SQL (support/admin)

If email isn't set up or you need to reset a user's password manually:

1. Go to Supabase Dashboard → SQL Editor.
2. Generate a bcrypt hash for the new password (e.g. use an online bcrypt tool or run `node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('YourNewPassword', 10));"` in the server directory).
3. Run:

```sql
UPDATE "User"
SET password = 'PASTE_BCRYPT_HASH_HERE'
WHERE email = 'user@example.com';
```

Replace `user@example.com` and the hash with the real email and hash.

### Create a new account

You can also sign up with a different email; the app will create a new user and team.
