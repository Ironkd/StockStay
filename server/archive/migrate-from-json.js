/**
 * Migration script to move data from data.json to Prisma database
 * 
 * Usage:
 * 1. Make sure you have a backup of data.json
 * 2. Run: node migrate-from-json.js
 */

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file manually
const envFile = join(__dirname, '.env');
if (existsSync(envFile)) {
  const envContent = readFileSync(envFile, 'utf8');
  const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
  if (match) {
    process.env.DATABASE_URL = match[1];
  }
}

// Prisma 7 requires a driver adapter for SQLite
// Get database URL from env or use default
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  databaseUrl = 'file:' + join(__dirname, 'dev.db');
}

// Remove 'file:' prefix for better-sqlite3 and ensure absolute path
let dbPath = databaseUrl.replace(/^file:/, '');
if (!dbPath.startsWith('/')) {
  // If relative path, make it absolute
  dbPath = join(__dirname, dbPath);
}

// Ensure DATABASE_URL is set for Prisma (with absolute path)
process.env.DATABASE_URL = databaseUrl;

// Create the database connection with absolute path
const sqlite = new Database(dbPath);
// Create adapter - pass config with url and the Database instance as options
const adapter = new PrismaBetterSqlite3({ url: databaseUrl }, { database: sqlite });

// Prisma Client reads from prisma.config.ts or DATABASE_URL env var
const prisma = new PrismaClient({ adapter });
const DATA_FILE = join(__dirname, 'data.json');

async function migrate() {
  try {
    console.log('🔄 Starting migration from JSON to database...\n');

    // Check if data.json exists
    if (!existsSync(DATA_FILE)) {
      console.log('⚠️  No data.json file found. Creating empty database...');
      return;
    }

    // Read existing data
    const jsonData = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    console.log('📖 Read data.json file\n');

    // Start transaction
    await prisma.$transaction(async (tx) => {
      // Clear existing data (if any)
      console.log('🧹 Clearing existing database...');
      await tx.invitation.deleteMany();
      await tx.sale.deleteMany();
      await tx.invoice.deleteMany();
      await tx.inventory.deleteMany();
      await tx.client.deleteMany();
      await tx.user.deleteMany();
      await tx.team.deleteMany();

      // Migrate Teams
      if (jsonData.teams && jsonData.teams.length > 0) {
        console.log(`📦 Migrating ${jsonData.teams.length} teams...`);
        for (const team of jsonData.teams) {
          await tx.team.create({
            data: {
              id: team.id,
              name: team.name,
              ownerId: team.ownerId,
              createdAt: new Date(team.createdAt || Date.now()),
              updatedAt: new Date(team.updatedAt || Date.now()),
            },
          });
        }
        console.log('✅ Teams migrated\n');
      }

      // Migrate Users
      if (jsonData.users && jsonData.users.length > 0) {
        console.log(`👥 Migrating ${jsonData.users.length} users...`);
        for (const user of jsonData.users) {
          await tx.user.create({
            data: {
              id: user.id,
              email: user.email,
              name: user.name,
              password: user.password,
              teamId: user.teamId || null,
              teamRole: user.teamRole || 'member',
              maxInventoryItems: user.maxInventoryItems ?? null,
              allowedPages: user.allowedPages ? JSON.stringify(user.allowedPages) : null,
              allowedWarehouseIds: user.allowedWarehouseIds
                ? JSON.stringify(user.allowedWarehouseIds)
                : null,
            },
          });
        }
        console.log('✅ Users migrated\n');
      }

      // Migrate Inventory
      if (jsonData.inventory && jsonData.inventory.length > 0) {
        console.log(`📦 Migrating ${jsonData.inventory.length} inventory items...`);
        for (const item of jsonData.inventory) {
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
              tags: JSON.stringify(item.tags || []),
              notes: item.notes || '',
              createdAt: new Date(item.createdAt || Date.now()),
              updatedAt: new Date(item.updatedAt || Date.now()),
            },
          });
        }
        console.log('✅ Inventory migrated\n');
      }

      // Migrate Clients
      if (jsonData.clients && jsonData.clients.length > 0) {
        console.log(`👤 Migrating ${jsonData.clients.length} clients...`);
        for (const client of jsonData.clients) {
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
              createdAt: new Date(client.createdAt || Date.now()),
              updatedAt: new Date(client.updatedAt || Date.now()),
            },
          });
        }
        console.log('✅ Clients migrated\n');
      }

      // Migrate Invoices
      if (jsonData.invoices && jsonData.invoices.length > 0) {
        console.log(`🧾 Migrating ${jsonData.invoices.length} invoices...`);
        for (const invoice of jsonData.invoices) {
          await tx.invoice.create({
            data: {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber || '',
              clientId: invoice.clientId || null,
              clientName: invoice.clientName || '',
              date: invoice.date || new Date().toISOString().split('T')[0],
              dueDate: invoice.dueDate || null,
              items: JSON.stringify(invoice.items || []),
              subtotal: invoice.subtotal || 0,
              tax: invoice.tax || 0,
              total: invoice.total || 0,
              status: invoice.status || 'draft',
              notes: invoice.notes || '',
              createdAt: new Date(invoice.createdAt || Date.now()),
              updatedAt: new Date(invoice.updatedAt || Date.now()),
            },
          });
        }
        console.log('✅ Invoices migrated\n');
      }

      // Migrate Sales
      if (jsonData.sales && jsonData.sales.length > 0) {
        console.log(`💰 Migrating ${jsonData.sales.length} sales...`);
        for (const sale of jsonData.sales) {
          await tx.sale.create({
            data: {
              id: sale.id,
              saleNumber: sale.saleNumber || '',
              clientId: sale.clientId || null,
              clientName: sale.clientName || '',
              date: sale.date || new Date().toISOString().split('T')[0],
              items: JSON.stringify(sale.items || []),
              subtotal: sale.subtotal || 0,
              tax: sale.tax || 0,
              total: sale.total || 0,
              notes: sale.notes || '',
              createdAt: new Date(sale.createdAt || Date.now()),
              updatedAt: new Date(sale.updatedAt || Date.now()),
            },
          });
        }
        console.log('✅ Sales migrated\n');
      }

      // Migrate Invitations
      if (jsonData.invitations && jsonData.invitations.length > 0) {
        console.log(`✉️  Migrating ${jsonData.invitations.length} invitations...`);
        for (const invitation of jsonData.invitations) {
          await tx.invitation.create({
            data: {
              id: invitation.id,
              teamId: invitation.teamId,
              email: invitation.email,
              teamRole: invitation.teamRole || 'member',
              maxInventoryItems: invitation.maxInventoryItems ?? null,
              allowedPages: invitation.allowedPages
                ? JSON.stringify(invitation.allowedPages)
                : null,
              allowedWarehouseIds: invitation.allowedWarehouseIds
                ? JSON.stringify(invitation.allowedWarehouseIds)
                : null,
              status: invitation.status || 'pending',
              token: invitation.token,
              createdAt: new Date(invitation.createdAt || Date.now()),
              expiresAt: invitation.expiresAt
                ? new Date(invitation.expiresAt)
                : null,
              invitedByUserId: invitation.invitedByUserId || null,
              acceptedAt: invitation.acceptedAt
                ? new Date(invitation.acceptedAt)
                : null,
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
      teams: await prisma.team.count(),
      users: await prisma.user.count(),
      inventory: await prisma.inventory.count(),
      clients: await prisma.client.count(),
      invoices: await prisma.invoice.count(),
      sales: await prisma.sale.count(),
      invitations: await prisma.invitation.count(),
    };
    console.log(`   Teams: ${counts.teams}`);
    console.log(`   Users: ${counts.users}`);
    console.log(`   Inventory Items: ${counts.inventory}`);
    console.log(`   Clients: ${counts.clients}`);
    console.log(`   Invoices: ${counts.invoices}`);
    console.log(`   Sales: ${counts.sales}`);
    console.log(`   Invitations: ${counts.invitations}`);
    console.log('\n💡 Tip: Keep a backup of data.json, but you can now use the database!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
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
