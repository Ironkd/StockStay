import { defineConfig } from 'prisma/config'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load server/.env so DATABASE_URL is set when running prisma migrate/deploy
const envPath = join(__dirname, '.env')
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf8')
  for (const line of env.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (match) {
      const key = match[1]
      const value = match[2].replace(/^["']|["']$/g, '').trim()
      if (!process.env[key]) process.env[key] = value
    }
  }
}

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    // DATABASE_URL from .env (e.g. Supabase PostgreSQL)
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/postgres',
  },
})
