-- Run this in Supabase SQL Editor to check and reset the demo user password

-- Check if user exists
SELECT id, email, name, LEFT(password, 20) as password_start FROM "User" WHERE email = 'demo@example.com';

-- If user exists, you can manually reset the password hash
-- The password 'demo123' hashed with bcrypt should start with $2a$10$ or $2b$10$
-- You'll need to generate a new hash using the reset script or manually
