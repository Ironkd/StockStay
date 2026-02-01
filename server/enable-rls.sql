-- Enable Row Level Security (RLS) on all public tables
-- This blocks Supabase PostgREST API access. Prisma uses a direct connection
-- (typically postgres role) which bypasses RLS, so your app continues to work.

-- Enable RLS on each table (with no policies = deny all for API access)
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;

-- _prisma_migrations: Prisma uses direct connection (bypasses RLS), so migrations still work.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
