/**
 * Test direct SQL query vs Prisma query
 */

import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
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
  }
}

console.log('🔌 Testing direct query vs Prisma...\n');

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
    // Test 1: Direct SQL query
    console.log('1. Testing direct SQL query...');
    const directResult = await pool.query('SELECT COUNT(*) as count FROM "User"');
    console.log(`✅ Direct query works: ${directResult.rows[0].count} users`);
    
    // Test 2: Prisma query
    console.log('\n2. Testing Prisma query...');
    const prismaCount = await prisma.user.count();
    console.log(`✅ Prisma query works: ${prismaCount} users`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:');
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
