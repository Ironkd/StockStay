/**
 * Simple migration: Read from SQLite, insert directly to Supabase using raw SQL
 * This bypasses Prisma connection issues
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load Supabase connection string
const envFile = join(__dirname, '.env');
let supabaseUrl = process.env.DATABASE_URL;
if (!supabaseUrl && existsSync(envFile)) {
  const envContent = readFileSync(envFile, 'utf8');
  const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
  if (match) {
    supabaseUrl = match[1];
  }
}

if (!supabaseUrl || !supabaseUrl.includes('supabase')) {
  console.error('❌ Error: DATABASE_URL not set or not a Supabase URL');
  process.exit(1);
}

// Parse connection string
const url = new URL(supabaseUrl.replace('postgresql://', 'http://'));
const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1) || 'postgres',
  user: url.username || 'postgres',
  password: url.password,
  ssl: { rejectUnauthorized: false }
};

// Connect to local SQLite
const localDbPath = join(__dirname, 'dev.db');
if (!existsSync(localDbPath)) {
  console.error('❌ Error: Local SQLite database not found');
  process.exit(1);
}

const sqlite = new Database(localDbPath);

// Try to use pg library, or provide manual instructions
async function migrate() {
  try {
    console.log('🔄 Starting migration from SQLite to Supabase...\n');
    
    // Read all data from SQLite
    console.log('📖 Reading data from SQLite...\n');
    
    const teams = sqlite.prepare('SELECT * FROM Team').all();
    const users = sqlite.prepare('SELECT * FROM User').all();
    const inventory = sqlite.prepare('SELECT * FROM Inventory').all();
    const clients = sqlite.prepare('SELECT * FROM Client').all();
    const invoices = sqlite.prepare('SELECT * FROM Invoice').all();
    const sales = sqlite.prepare('SELECT * FROM Sale').all();
    const invitations = sqlite.prepare('SELECT * FROM Invitation').all();
    
    console.log(`Found: ${teams.length} teams, ${users.length} users, ${inventory.length} inventory, ${clients.length} clients, ${invoices.length} invoices, ${sales.length} sales, ${invitations.length} invitations\n`);
    
    // Generate SQL INSERT statements
    console.log('📝 Generating SQL INSERT statements...\n');
    
    let sqlStatements = [];
    
    // Teams
    if (teams.length > 0) {
      for (const team of teams) {
        sqlStatements.push(
          `INSERT INTO "Team" (id, name, "ownerId", "createdAt", "updatedAt") VALUES ('${team.id}', '${team.name.replace(/'/g, "''")}', '${team.ownerId}', '${team.createdAt}', '${team.updatedAt}') ON CONFLICT (id) DO NOTHING;`
        );
      }
    }
    
    // Users
    if (users.length > 0) {
      for (const user of users) {
        sqlStatements.push(
          `INSERT INTO "User" (id, email, name, password, "teamId", "teamRole", "maxInventoryItems", "allowedPages", "allowedWarehouseIds", "createdAt", "updatedAt") VALUES ('${user.id}', '${user.email}', '${user.name.replace(/'/g, "''")}', '${user.password}', ${user.teamId ? `'${user.teamId}'` : 'NULL'}, ${user.teamRole ? `'${user.teamRole}'` : "'member'"}, ${user.maxInventoryItems ?? 'NULL'}, ${user.allowedPages ? `'${user.allowedPages}'` : 'NULL'}, ${user.allowedWarehouseIds ? `'${user.allowedWarehouseIds}'` : 'NULL'}, '${user.createdAt}', '${user.updatedAt}') ON CONFLICT (id) DO NOTHING;`
        );
      }
    }
    
    // Inventory
    if (inventory.length > 0) {
      for (const item of inventory) {
        sqlStatements.push(
          `INSERT INTO "Inventory" (id, name, sku, category, location, "warehouseId", quantity, unit, "reorderPoint", "priceBoughtFor", "markupPercentage", "finalPrice", tags, notes, "createdAt", "updatedAt") VALUES ('${item.id}', '${item.name.replace(/'/g, "''")}', '${(item.sku || '').replace(/'/g, "''")}', '${(item.category || '').replace(/'/g, "''")}', '${(item.location || '').replace(/'/g, "''")}', ${item.warehouseId ? `'${item.warehouseId}'` : 'NULL'}, ${item.quantity || 0}, '${(item.unit || '').replace(/'/g, "''")}', ${item.reorderPoint || 0}, ${item.priceBoughtFor ?? 'NULL'}, ${item.markupPercentage ?? 'NULL'}, ${item.finalPrice ?? 'NULL'}, '${item.tags || '[]'}', '${(item.notes || '').replace(/'/g, "''")}', '${item.createdAt}', '${item.updatedAt}') ON CONFLICT (id) DO NOTHING;`
        );
      }
    }
    
    // Clients
    if (clients.length > 0) {
      for (const client of clients) {
        sqlStatements.push(
          `INSERT INTO "Client" (id, name, email, phone, address, "streetAddress", city, province, "postalCode", country, company, notes, "createdAt", "updatedAt") VALUES ('${client.id}', '${client.name.replace(/'/g, "''")}', '${(client.email || '').replace(/'/g, "''")}', '${(client.phone || '').replace(/'/g, "''")}', '${(client.address || '').replace(/'/g, "''")}', ${client.streetAddress ? `'${client.streetAddress.replace(/'/g, "''")}'` : 'NULL'}, ${client.city ? `'${client.city.replace(/'/g, "''")}'` : 'NULL'}, ${client.province ? `'${client.province.replace(/'/g, "''")}'` : 'NULL'}, ${client.postalCode ? `'${client.postalCode.replace(/'/g, "''")}'` : 'NULL'}, ${client.country ? `'${client.country.replace(/'/g, "''")}'` : 'NULL'}, '${(client.company || '').replace(/'/g, "''")}', '${(client.notes || '').replace(/'/g, "''")}', '${client.createdAt}', '${client.updatedAt}') ON CONFLICT (id) DO NOTHING;`
        );
      }
    }
    
    // Invoices
    if (invoices.length > 0) {
      for (const invoice of invoices) {
        sqlStatements.push(
          `INSERT INTO "Invoice" (id, "invoiceNumber", "clientId", "clientName", date, "dueDate", items, subtotal, tax, total, status, notes, "createdAt", "updatedAt") VALUES ('${invoice.id}', '${invoice.invoiceNumber.replace(/'/g, "''")}', ${invoice.clientId ? `'${invoice.clientId}'` : 'NULL'}, '${invoice.clientName.replace(/'/g, "''")}', '${invoice.date}', ${invoice.dueDate ? `'${invoice.dueDate}'` : 'NULL'}, '${invoice.items.replace(/'/g, "''")}', ${invoice.subtotal || 0}, ${invoice.tax || 0}, ${invoice.total || 0}, '${invoice.status || 'draft'}', '${(invoice.notes || '').replace(/'/g, "''")}', '${invoice.createdAt}', '${invoice.updatedAt}') ON CONFLICT (id) DO NOTHING;`
        );
      }
    }
    
    // Sales
    if (sales.length > 0) {
      for (const sale of sales) {
        sqlStatements.push(
          `INSERT INTO "Sale" (id, "saleNumber", "clientId", "clientName", date, items, subtotal, tax, total, notes, "createdAt", "updatedAt") VALUES ('${sale.id}', '${(sale.saleNumber || '').replace(/'/g, "''")}', ${sale.clientId ? `'${sale.clientId}'` : 'NULL'}, '${sale.clientName.replace(/'/g, "''")}', '${sale.date}', '${sale.items.replace(/'/g, "''")}', ${sale.subtotal || 0}, ${sale.tax || 0}, ${sale.total || 0}, '${(sale.notes || '').replace(/'/g, "''")}', '${sale.createdAt}', '${sale.updatedAt}') ON CONFLICT (id) DO NOTHING;`
        );
      }
    }
    
    // Invitations
    if (invitations.length > 0) {
      for (const invitation of invitations) {
        sqlStatements.push(
          `INSERT INTO "Invitation" (id, "teamId", email, "teamRole", "maxInventoryItems", "allowedPages", "allowedWarehouseIds", status, token, "createdAt", "expiresAt", "invitedByUserId", "acceptedAt", "acceptedByUserId") VALUES ('${invitation.id}', '${invitation.teamId}', '${invitation.email}', '${invitation.teamRole || 'member'}', ${invitation.maxInventoryItems ?? 'NULL'}, ${invitation.allowedPages ? `'${invitation.allowedPages}'` : 'NULL'}, ${invitation.allowedWarehouseIds ? `'${invitation.allowedWarehouseIds}'` : 'NULL'}, '${invitation.status || 'pending'}', '${invitation.token}', '${invitation.createdAt}', ${invitation.expiresAt ? `'${invitation.expiresAt}'` : 'NULL'}, ${invitation.invitedByUserId ? `'${invitation.invitedByUserId}'` : 'NULL'}, ${invitation.acceptedAt ? `'${invitation.acceptedAt}'` : 'NULL'}, ${invitation.acceptedByUserId ? `'${invitation.acceptedByUserId}'` : 'NULL'}) ON CONFLICT (id) DO NOTHING;`
        );
      }
    }
    
    // Write SQL file
    const sqlFile = join(__dirname, 'insert-data-to-supabase.sql');
    const fs = await import('fs');
    fs.writeFileSync(sqlFile, sqlStatements.join('\n\n'));
    
    console.log(`✅ Generated ${sqlStatements.length} SQL INSERT statements`);
    console.log(`📄 SQL file saved to: ${sqlFile}\n`);
    console.log('📋 Next steps:');
    console.log('1. Open Supabase SQL Editor');
    console.log('2. Open the file: insert-data-to-supabase.sql');
    console.log('3. Copy all the SQL');
    console.log('4. Paste into Supabase SQL Editor');
    console.log('5. Click Run\n');
    console.log('Or, if you have pg library installed, we can run it automatically.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    sqlite.close();
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
