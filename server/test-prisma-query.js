/**
 * Test Prisma query directly
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

console.log('🔌 Testing Prisma query...\n');
console.log('Connection:', databaseUrl?.replace(/:[^:@]+@/, ':****@'));

// Create pool and adapter (same as db.js)
let poolConfig;
if (databaseUrl && databaseUrl.includes('supabase')) {
  poolConfig = {
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else {
  poolConfig = { connectionString: databaseUrl };
}

const pool = new pg.Pool(poolConfig);
const adapter = new PrismaPg({ pool });
const prisma = new PrismaClient({ adapter });

async function test() {
  try {
    console.log('1. Testing simple query...');
    const count = await prisma.user.count();
    console.log(`✅ User count: ${count}`);
    
    console.log('\n2. Testing findUnique...');
    const user = await prisma.user.findUnique({
      where: { email: 'test@example.com' }
    });
    console.log(`✅ FindUnique works:`, user ? 'User found' : 'User not found');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Prisma query failed:');
    console.error('   Code:', error.code);
    console.error('   Message:', error.message);
    if (error.meta) {
      console.error('   Meta:', error.meta);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

test();
