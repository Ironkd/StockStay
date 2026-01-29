import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env manually
dotenv.config({ path: join(__dirname, '.env') });

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not set in .env');
  process.exit(1);
}

console.log('🔌 Testing direct SQL query...\n');
console.log(`Connection: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}\n`);

let poolConfig;
if (databaseUrl.includes('supabase')) {
  poolConfig = {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  };
} else {
  poolConfig = { connectionString: databaseUrl };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('❌ Unexpected pool error:', err);
});

async function test() {
  let client;
  try {
    console.log('1. Connecting to database...');
    client = await pool.connect();
    console.log('✅ Connected!\n');

    console.log('2. Testing raw SQL query: SELECT COUNT(*) FROM "User"...');
    const result = await client.query('SELECT COUNT(*) as count FROM "User"');
    console.log(`✅ Query successful! User count: ${result.rows[0].count}\n`);

    console.log('3. Testing SELECT from Team table...');
    const teamResult = await client.query('SELECT id, name, plan, "maxWarehouses" FROM "Team" LIMIT 1');
    console.log(`✅ Team query successful!`);
    if (teamResult.rows.length > 0) {
      console.log(`   Team: ${JSON.stringify(teamResult.rows[0], null, 2)}`);
    } else {
      console.log('   No teams found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Code:', error.code);
    console.error('   Full error:', error);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

test();
