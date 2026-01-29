/**
 * Test pg Pool connection directly
 */

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
  }
}

console.log('🔌 Testing pg Pool connection...\n');
console.log('Connection string:', databaseUrl?.replace(/:[^:@]+@/, ':****@'));

// Use connection string directly with SSL config (same as db.js)
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

console.log('Pool config:', {
  host: poolConfig.host,
  port: poolConfig.port,
  database: poolConfig.database,
  user: poolConfig.user,
  password: '****'
});

const pool = new pg.Pool(poolConfig);

pool.query('SELECT NOW() as time, current_database() as db')
  .then((result) => {
    console.log('\n✅ Connection successful!');
    console.log('   Time:', result.rows[0].time);
    console.log('   Database:', result.rows[0].db);
    
    // Test querying a table
    return pool.query('SELECT COUNT(*) as count FROM "Team"');
  })
  .then((result) => {
    console.log('\n✅ Table query successful!');
    console.log('   Teams count:', result.rows[0].count);
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Connection failed:', err.message);
    console.error('   Code:', err.code);
    console.error('   Full error:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
