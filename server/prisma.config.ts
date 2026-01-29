import { defineConfig } from 'prisma/config'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    // DATABASE_URL from .env (e.g. Supabase PostgreSQL)
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/postgres',
  },
})
