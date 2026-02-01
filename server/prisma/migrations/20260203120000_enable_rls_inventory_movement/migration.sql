-- Enable Row Level Security on InventoryMovement (fixes Supabase Security Advisor: RLS Disabled in Public)
-- With RLS enabled and no policies, PostgREST (anon/authenticated) sees no rows; backend (Prisma) uses role with BYPASSRLS.
ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;
