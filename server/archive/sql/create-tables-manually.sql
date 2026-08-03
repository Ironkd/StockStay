-- Run this SQL in Supabase SQL Editor to create tables manually
-- Then we can migrate the data

-- Create Teams table
CREATE TABLE IF NOT EXISTS "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Team_ownerId_idx" ON "Team"("ownerId");

-- Create Users table
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "teamId" TEXT,
    "teamRole" TEXT DEFAULT 'member',
    "maxInventoryItems" INTEGER,
    "allowedPages" TEXT,
    "allowedWarehouseIds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_teamId_idx" ON "User"("teamId");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

-- Add foreign key constraint (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'User_teamId_fkey'
    ) THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" 
        FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Create Inventory table
CREATE TABLE IF NOT EXISTS "Inventory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "warehouseId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '',
    "reorderPoint" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceBoughtFor" DOUBLE PRECISION,
    "markupPercentage" DOUBLE PRECISION,
    "finalPrice" DOUBLE PRECISION,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Inventory_warehouseId_idx" ON "Inventory"("warehouseId");
CREATE INDEX IF NOT EXISTS "Inventory_category_idx" ON "Inventory"("category");

-- Create Client table
CREATE TABLE IF NOT EXISTS "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "streetAddress" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "company" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Client_email_idx" ON "Client"("email");

-- Create Invoice table
CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "dueDate" TEXT,
    "items" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX IF NOT EXISTS "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_saleId_key" ON "Invoice"("saleId");
CREATE INDEX IF NOT EXISTS "Invoice_saleId_idx" ON "Invoice"("saleId");

-- Create Sale table
CREATE TABLE IF NOT EXISTS "Sale" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Sale_clientId_idx" ON "Sale"("clientId");
CREATE INDEX IF NOT EXISTS "Sale_date_idx" ON "Sale"("date");

-- Create Invitation table
CREATE TABLE IF NOT EXISTS "Invitation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "teamRole" TEXT NOT NULL DEFAULT 'member',
    "maxInventoryItems" INTEGER,
    "allowedPages" TEXT,
    "allowedWarehouseIds" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "invitedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation"("token");
CREATE INDEX IF NOT EXISTS "Invitation_teamId_idx" ON "Invitation"("teamId");
CREATE INDEX IF NOT EXISTS "Invitation_token_idx" ON "Invitation"("token");
CREATE INDEX IF NOT EXISTS "Invitation_email_idx" ON "Invitation"("email");
