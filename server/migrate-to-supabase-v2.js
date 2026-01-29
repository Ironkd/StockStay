/**
 * Migration script to move data from local SQLite to Supabase PostgreSQL
 * Reads directly from SQLite file, writes to Supabase using Prisma
 */

import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables FIRST
const envFile = join(__dirname, '.env');
if (existsSync(envFile)) {
  const envContent = readFileSync(envFile, 'utf8');
  const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
  if (match) {
    process.env.DATABASE_URL = match[1];
  }
}

// Check for Supabase DATABASE_URL
const supabaseUrl = process.env.DATABASE_URL;
if (!supabaseUrl || !supabaseUrl.includes('supabase')) {
  console.error('❌ Error: DATABASE_URL not set or not a Supabase URL');
  console.error('Current DATABASE_URL:', supabaseUrl || 'not set');
  console.error('Please set DATABASE_URL to your Supabase PostgreSQL connection string');
  process.exit(1);
}

// Ensure DATABASE_URL is set for Prisma
process.env.DATABASE_URL = supabaseUrl;

// Connect to local SQLite database (direct, no Prisma)
const localDbPath = join(__dirname, 'dev.db');
if (!existsSync(localDbPath)) {
  console.error('❌ Error: Local SQLite database not found at:', localDbPath);
  process.exit(1);
}

const sqlite = new Database(localDbPath);

// Connect to Supabase PostgreSQL using Prisma
// Prisma 7 reads from prisma.config.ts or DATABASE_URL env var
const supabasePrisma = new PrismaClient();

async function migrate() {
  try {
    console.log('🔄 Starting migration from SQLite to Supabase PostgreSQL...\n');
    console.log('📡 Connecting to Supabase...');

    // Test Supabase connection
    await supabasePrisma.$connect();
    console.log('✅ Connected to Supabase\n');

    // Start transaction on Supabase
    await supabasePrisma.$transaction(async (tx) => {
      // Clear existing data in Supabase (if any)
      console.log('🧹 Clearing existing Supabase data...');
      await tx.invitation.deleteMany();
      await tx.sale.deleteMany();
      await tx.invoice.deleteMany();
      await tx.inventory.deleteMany();
      await tx.client.deleteMany();
      await tx.user.deleteMany();
      await tx.team.deleteMany();

      // Read from SQLite using raw SQL and write to Supabase
      console.log('📖 Reading data from local SQLite database...\n');

      // Migrate Teams
      const teams = sqlite.prepare('SELECT * FROM Team').all();
      if (teams.length > 0) {
        console.log(`📦 Migrating ${teams.length} teams...`);
        for (const team of teams) {
          await tx.team.create({
            data: {
              id: team.id,
              name: team.name,
              ownerId: team.ownerId,
              createdAt: new Date(team.createdAt),
              updatedAt: new Date(team.updatedAt),
            },
          });
        }
        console.log('✅ Teams migrated\n');
      }

      // Migrate Users
      const users = sqlite.prepare('SELECT * FROM User').all();
      if (users.length > 0) {
        console.log(`👥 Migrating ${users.length} users...`);
        for (const user of users) {
          await tx.user.create({
            data: {
              id: user.id,
              email: user.email,
              name: user.name,
              password: user.password,
              teamId: user.teamId || null,
              teamRole: user.teamRole || 'member',
              maxInventoryItems: user.maxInventoryItems ?? null,
              allowedPages: user.allowedPages || null,
              allowedWarehouseIds: user.allowedWarehouseIds || null,
              createdAt: new Date(user.createdAt),
              updatedAt: new Date(user.updatedAt),
            },
          });
        }
        console.log('✅ Users migrated\n');
      }

      // Migrate Inventory
      const inventory = sqlite.prepare('SELECT * FROM Inventory').all();
      if (inventory.length > 0) {
        console.log(`📦 Migrating ${inventory.length} inventory items...`);
        for (const item of inventory) {
          await tx.inventory.create({
            data: {
              id: item.id,
              name: item.name,
              sku: item.sku || '',
              category: item.category || '',
              location: item.location || '',
              warehouseId: item.warehouseId || null,
              quantity: item.quantity || 0,
              unit: item.unit || '',
              reorderPoint: item.reorderPoint || 0,
              priceBoughtFor: item.priceBoughtFor ?? null,
              markupPercentage: item.markupPercentage ?? null,
              finalPrice: item.finalPrice ?? null,
              tags: item.tags || '[]',
              notes: item.notes || '',
              createdAt: new Date(item.createdAt),
              updatedAt: new Date(item.updatedAt),
            },
          });
        }
        console.log('✅ Inventory migrated\n');
      }

      // Migrate Clients
      const clients = sqlite.prepare('SELECT * FROM Client').all();
      if (clients.length > 0) {
        console.log(`👤 Migrating ${clients.length} clients...`);
        for (const client of clients) {
          await tx.client.create({
            data: {
              id: client.id,
              name: client.name,
              email: client.email || '',
              phone: client.phone || '',
              address: client.address || '',
              streetAddress: client.streetAddress || null,
              city: client.city || null,
              province: client.province || null,
              postalCode: client.postalCode || null,
              country: client.country || null,
              company: client.company || '',
              notes: client.notes || '',
              createdAt: new Date(client.createdAt),
              updatedAt: new Date(client.updatedAt),
            },
          });
        }
        console.log('✅ Clients migrated\n');
      }

      // Migrate Invoices
      const invoices = sqlite.prepare('SELECT * FROM Invoice').all();
      if (invoices.length > 0) {
        console.log(`🧾 Migrating ${invoices.length} invoices...`);
        for (const invoice of invoices) {
          await tx.invoice.create({
            data: {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber || '',
              clientId: invoice.clientId || null,
              clientName: invoice.clientName || '',
              date: invoice.date || new Date().toISOString().split('T')[0],
              dueDate: invoice.dueDate || null,
              items: invoice.items || '[]',
              subtotal: invoice.subtotal || 0,
              tax: invoice.tax || 0,
              total: invoice.total || 0,
              status: invoice.status || 'draft',
              notes: invoice.notes || '',
              createdAt: new Date(invoice.createdAt),
              updatedAt: new Date(invoice.updatedAt),
            },
          });
        }
        console.log('✅ Invoices migrated\n');
      }

      // Migrate Sales
      const sales = sqlite.prepare('SELECT * FROM Sale').all();
      if (sales.length > 0) {
        console.log(`💰 Migrating ${sales.length} sales...`);
        for (const sale of sales) {
          await tx.sale.create({
            data: {
              id: sale.id,
              saleNumber: sale.saleNumber || '',
              clientId: sale.clientId || null,
              clientName: sale.clientName || '',
              date: sale.date || new Date().toISOString().split('T')[0],
              items: sale.items || '[]',
              subtotal: sale.subtotal || 0,
              tax: sale.tax || 0,
              total: sale.total || 0,
              notes: sale.notes || '',
              createdAt: new Date(sale.createdAt),
              updatedAt: new Date(sale.updatedAt),
            },
          });
        }
        console.log('✅ Sales migrated\n');
      }

      // Migrate Invitations
      const invitations = sqlite.prepare('SELECT * FROM Invitation').all();
      if (invitations.length > 0) {
        console.log(`✉️  Migrating ${invitations.length} invitations...`);
        for (const invitation of invitations) {
          await tx.invitation.create({
            data: {
              id: invitation.id,
              teamId: invitation.teamId,
              email: invitation.email,
              teamRole: invitation.teamRole || 'member',
              maxInventoryItems: invitation.maxInventoryItems ?? null,
              allowedPages: invitation.allowedPages || null,
              allowedWarehouseIds: invitation.allowedWarehouseIds || null,
              status: invitation.status || 'pending',
              token: invitation.token,
              createdAt: new Date(invitation.createdAt),
              expiresAt: invitation.expiresAt ? new Date(invitation.expiresAt) : null,
              invitedByUserId: invitation.invitedByUserId || null,
              acceptedAt: invitation.acceptedAt ? new Date(invitation.acceptedAt) : null,
              acceptedByUserId: invitation.acceptedByUserId || null,
            },
          });
        }
        console.log('✅ Invitations migrated\n');
      }
    });

    console.log('🎉 Migration completed successfully!');
    console.log('\n📊 Summary:');
    const counts = {
      teams: await supabasePrisma.team.count(),
      users: await supabasePrisma.user.count(),
      inventory: await supabasePrisma.inventory.count(),
      clients: await supabasePrisma.client.count(),
      invoices: await supabasePrisma.invoice.count(),
      sales: await supabasePrisma.sale.count(),
      invitations: await supabasePrisma.invitation.count(),
    };
    console.log(`   Teams: ${counts.teams}`);
    console.log(`   Users: ${counts.users}`);
    console.log(`   Inventory Items: ${counts.inventory}`);
    console.log(`   Clients: ${counts.clients}`);
    console.log(`   Invoices: ${counts.invoices}`);
    console.log(`   Sales: ${counts.sales}`);
    console.log(`   Invitations: ${counts.invitations}`);
    console.log('\n✅ Your data is now in Supabase!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    sqlite.close();
    await supabasePrisma.$disconnect();
  }
}

migrate()
  .then(() => {
    console.log('\n✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
