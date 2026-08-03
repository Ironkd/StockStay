/**
 * Migration script to move data from local SQLite to Supabase PostgreSQL
 * 
 * Usage:
 * 1. Set up Supabase project and get DATABASE_URL
 * 2. Set DATABASE_URL environment variable to your Supabase connection string
 * 3. Run: node migrate-to-supabase.js
 */

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
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
  console.error('Please set DATABASE_URL to your Supabase PostgreSQL connection string');
  console.error('Example: postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres');
  process.exit(1);
}

// Connect to local SQLite database to read data
const localDbPath = join(__dirname, 'dev.db');
if (!existsSync(localDbPath)) {
  console.error('❌ Error: Local SQLite database not found at:', localDbPath);
  console.error('Make sure you have run the local migration first');
  process.exit(1);
}

const sqlite = new Database(localDbPath);
const sqliteAdapter = new PrismaBetterSqlite3({ url: `file:${localDbPath}` }, { database: sqlite });
const sqlitePrisma = new PrismaClient({ adapter: sqliteAdapter });

// Connect to Supabase PostgreSQL
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

      // Read from SQLite and write to Supabase
      console.log('📖 Reading data from local SQLite database...\n');

      // Migrate Teams
      const teams = await sqlitePrisma.team.findMany();
      if (teams.length > 0) {
        console.log(`📦 Migrating ${teams.length} teams...`);
        for (const team of teams) {
          await tx.team.create({ data: team });
        }
        console.log('✅ Teams migrated\n');
      }

      // Migrate Users
      const users = await sqlitePrisma.user.findMany();
      if (users.length > 0) {
        console.log(`👥 Migrating ${users.length} users...`);
        for (const user of users) {
          await tx.user.create({ data: user });
        }
        console.log('✅ Users migrated\n');
      }

      // Migrate Inventory
      const inventory = await sqlitePrisma.inventory.findMany();
      if (inventory.length > 0) {
        console.log(`📦 Migrating ${inventory.length} inventory items...`);
        for (const item of inventory) {
          await tx.inventory.create({ data: item });
        }
        console.log('✅ Inventory migrated\n');
      }

      // Migrate Clients
      const clients = await sqlitePrisma.client.findMany();
      if (clients.length > 0) {
        console.log(`👤 Migrating ${clients.length} clients...`);
        for (const client of clients) {
          await tx.client.create({ data: client });
        }
        console.log('✅ Clients migrated\n');
      }

      // Migrate Invoices
      const invoices = await sqlitePrisma.invoice.findMany();
      if (invoices.length > 0) {
        console.log(`🧾 Migrating ${invoices.length} invoices...`);
        for (const invoice of invoices) {
          await tx.invoice.create({ data: invoice });
        }
        console.log('✅ Invoices migrated\n');
      }

      // Migrate Sales
      const sales = await sqlitePrisma.sale.findMany();
      if (sales.length > 0) {
        console.log(`💰 Migrating ${sales.length} sales...`);
        for (const sale of sales) {
          await tx.sale.create({ data: sale });
        }
        console.log('✅ Sales migrated\n');
      }

      // Migrate Invitations
      const invitations = await sqlitePrisma.invitation.findMany();
      if (invitations.length > 0) {
        console.log(`✉️  Migrating ${invitations.length} invitations...`);
        for (const invitation of invitations) {
          await tx.invitation.create({ data: invitation });
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
    console.log('💡 Update your DATABASE_URL to use Supabase connection string');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sqlitePrisma.$disconnect();
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
