/**
 * Quick test to verify Supabase connection
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env
const envFile = join(__dirname, '.env');
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && existsSync(envFile)) {
  const envContent = readFileSync(envFile, 'utf8');
  const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
  if (match) {
    databaseUrl = match[1];
    process.env.DATABASE_URL = databaseUrl;
  }
}

// Prisma 7 requires adapter for PostgreSQL
// Parse connection string and configure SSL properly
const url = new URL(databaseUrl.replace('postgresql://', 'http://'));
const poolConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1) || 'postgres',
  user: url.username || 'postgres',
  password: url.password,
  ssl: {
    rejectUnauthorized: false
  }
};

const pool = new pg.Pool(poolConfig);
const adapter = new PrismaPg({ pool });
const prisma = new PrismaClient({ adapter });

async function test() {
  try {
    console.log('🔌 Testing Supabase connection...\n');
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to Supabase!\n');
    
    // Try a simple query first
    console.log('📊 Testing queries...\n');
    
    // Use findMany and count manually to avoid adapter issues
    const teams = await prisma.team.findMany();
    const users = await prisma.user.findMany();
    const inventory = await prisma.inventory.findMany();
    const clients = await prisma.client.findMany();
    const invoices = await prisma.invoice.findMany();
    const sales = await prisma.sale.findMany();
    
    console.log('📊 Data counts:');
    console.log(`   Teams: ${teams.length}`);
    console.log(`   Users: ${users.length}`);
    console.log(`   Inventory: ${inventory.length}`);
    console.log(`   Clients: ${clients.length}`);
    console.log(`   Invoices: ${invoices.length}`);
    console.log(`   Sales: ${sales.length}`);
    
    if (users.length > 0) {
      const user = users[0];
      console.log(`\n👤 Sample user: ${user.email} (${user.name})`);
    }
    
    console.log('\n✅ All tests passed! Your app is ready to use Supabase.');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

test();
