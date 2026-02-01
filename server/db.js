/**
 * Database helper module using Prisma
 * Uses PostgreSQL (Supabase) via pg adapter when DATABASE_URL is a postgres URL.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file manually (for local development)
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

const isPostgres = databaseUrl && (
  databaseUrl.startsWith('postgresql://') ||
  databaseUrl.startsWith('postgres://') ||
  databaseUrl.includes('supabase')
);

let prisma;
if (isPostgres) {
  const url = new URL(databaseUrl.replace(/^postgres(ql)?:\/\//, 'http://'));
  const poolConfig = {
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    database: url.pathname.slice(1) || 'postgres',
    user: url.username || 'postgres',
    password: url.password,
    ssl: url.hostname.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  };
  const pool = new pg.Pool(poolConfig);
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
  console.log('🔌 Using Supabase (PostgreSQL)');
} else {
  throw new Error(
    'DATABASE_URL must be a PostgreSQL URL (e.g. Supabase). ' +
    'Example: postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres'
  );
}

// Helper to parse JSON fields
const parseJson = (str, defaultValue = null) => {
  if (!str) return defaultValue;
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
};

// Helper to stringify JSON fields
const stringifyJson = (value) => {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
};

// Initialize demo user and team if no users exist
export async function initDemoUser() {
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
    const now = new Date();
    const teamId = crypto.randomUUID();

    // Create demo team
    await prisma.team.create({
      data: {
        id: teamId,
        name: 'Demo Team',
        ownerId: '1',
      },
    });

    // Create demo user (password: demo123)
    const bcrypt = await import('bcryptjs');
    const hashedPassword = bcrypt.hashSync('demo123', 10);

    await prisma.user.create({
      data: {
        id: '1',
        email: 'demo@example.com',
        name: 'Demo User',
        password: hashedPassword,
        teamId: teamId,
        teamRole: 'owner',
        maxInventoryItems: null,
        allowedPages: null,
        allowedWarehouseIds: null,
        emailVerified: true,
      },
    });
      console.log('✅ Demo user initialized');
    }
  } catch (error) {
    // Don't crash if database isn't available yet
    // Connection will be retried on first API call
    console.warn('⚠️  Could not initialize demo user (database may not be ready):', error.message);
    console.warn('   This is OK - demo user will be created on first login');
  }
}

// User operations
export const userOps = {
  async findById(id) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return {
      ...user,
      allowedPages: parseJson(user.allowedPages),
      allowedWarehouseIds: parseJson(user.allowedWarehouseIds),
    };
  },

  async findByEmail(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return {
      ...user,
      allowedPages: parseJson(user.allowedPages),
      allowedWarehouseIds: parseJson(user.allowedWarehouseIds),
    };
  },

  async findByEmailVerificationToken(token) {
    if (!token) return null;
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiresAt: { gt: new Date() },
      },
    });
    if (!user) return null;
    return {
      ...user,
      allowedPages: parseJson(user.allowedPages),
      allowedWarehouseIds: parseJson(user.allowedWarehouseIds),
    };
  },

  async create(data) {
    const user = await prisma.user.create({
      data: {
        ...data,
        allowedPages: stringifyJson(data.allowedPages),
        allowedWarehouseIds: stringifyJson(data.allowedWarehouseIds),
      },
    });
    return {
      ...user,
      allowedPages: parseJson(user.allowedPages),
      allowedWarehouseIds: parseJson(user.allowedWarehouseIds),
    };
  },

  async update(id, data) {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...data,
        allowedPages: data.allowedPages !== undefined ? stringifyJson(data.allowedPages) : undefined,
        allowedWarehouseIds:
          data.allowedWarehouseIds !== undefined
            ? stringifyJson(data.allowedWarehouseIds)
            : undefined,
      },
    });
    return {
      ...user,
      allowedPages: parseJson(user.allowedPages),
      allowedWarehouseIds: parseJson(user.allowedWarehouseIds),
    };
  },

  async findAllByTeam(teamId) {
    const users = await prisma.user.findMany({ where: { teamId } });
    return users.map((u) => ({
      ...u,
      allowedPages: parseJson(u.allowedPages),
      allowedWarehouseIds: parseJson(u.allowedWarehouseIds),
    }));
  },
};

// Password reset token operations
export const passwordResetTokenOps = {
  async create(data) {
    return prisma.passwordResetToken.create({ data });
  },

  async findByToken(token) {
    if (!token) return null;
    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!record || record.expiresAt < new Date()) return null;
    return record;
  },

  async deleteByToken(token) {
    await prisma.passwordResetToken.deleteMany({ where: { token } });
  },

  async deleteByUserId(userId) {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
  },
};

// Team operations
export const teamOps = {
  async findById(id) {
    return await prisma.team.findUnique({ where: { id } });
  },

  async create(data) {
    return await prisma.team.create({ data });
  },

  async update(id, data) {
    return await prisma.team.update({ where: { id }, data });
  },
};

// Warehouse operations
export const warehouseOps = {
  async findAllByTeam(teamId) {
    return await prisma.warehouse.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async countByTeam(teamId) {
    return await prisma.warehouse.count({ where: { teamId } });
  },

  async createForTeam(teamId, data) {
    return await prisma.warehouse.create({
      data: {
        teamId,
        name: data.name,
        location: data.location || null,
      },
    });
  },

  async update(id, data) {
    return await prisma.warehouse.update({
      where: { id },
      data: {
        name: data.name,
        location: data.location,
      },
    });
  },

  async delete(id) {
    // Note: inventory items referencing this warehouse are NOT auto-deleted.
    // The app should prevent deleting warehouses that still have inventory.
    return await prisma.warehouse.delete({ where: { id } });
  },
};

// Inventory operations
export const inventoryOps = {
  async findAll(warehouseFilter = null) {
    const where = warehouseFilter ? { warehouseId: { in: warehouseFilter } } : {};
    const items = await prisma.inventory.findMany({ where, orderBy: { createdAt: 'desc' } });
    return items.map((item) => ({
      ...item,
      tags: parseJson(item.tags, []),
    }));
  },

  async findById(id) {
    const item = await prisma.inventory.findUnique({ where: { id } });
    if (!item) return null;
    return {
      ...item,
      tags: parseJson(item.tags, []),
    };
  },

  /** Find an existing product in a warehouse by name and sku (same warehouse = same product). */
  async findInWarehouseByNameAndSku(warehouseId, name, sku) {
    if (!warehouseId) return null;
    const item = await prisma.inventory.findFirst({
      where: {
        warehouseId,
        name: name || "",
        sku: sku != null && sku !== undefined ? String(sku) : "",
      },
    });
    if (!item) return null;
    return {
      ...item,
      tags: parseJson(item.tags, []),
    };
  },

  async create(data) {
    const item = await prisma.inventory.create({
      data: {
        ...data,
        tags: stringifyJson(data.tags || []),
      },
    });
    return {
      ...item,
      tags: parseJson(item.tags, []),
    };
  },

  async update(id, data) {
    const item = await prisma.inventory.update({
      where: { id },
      data: {
        ...data,
        tags: data.tags !== undefined ? stringifyJson(data.tags) : undefined,
      },
    });
    return {
      ...item,
      tags: parseJson(item.tags, []),
    };
  },

  async delete(id) {
    return await prisma.inventory.delete({ where: { id } });
  },

  async deleteAll() {
    return await prisma.inventory.deleteMany();
  },

  /** Delete only items in the given warehouse IDs (for team-scoped clear). */
  async deleteByWarehouseIds(warehouseIds) {
    if (!Array.isArray(warehouseIds) || warehouseIds.length === 0) {
      return { count: 0 };
    }
    return await prisma.inventory.deleteMany({
      where: { warehouseId: { in: warehouseIds } },
    });
  },

  async count() {
    return await prisma.inventory.count();
  },

  /** Count items in the given warehouse IDs (for team-scoped limits). */
  async countByWarehouseIds(warehouseIds) {
    if (!Array.isArray(warehouseIds) || warehouseIds.length === 0) {
      return 0;
    }
    return await prisma.inventory.count({
      where: { warehouseId: { in: warehouseIds } },
    });
  },
};

// Client operations
export const clientOps = {
  async findAll() {
    return await prisma.client.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async findById(id) {
    return await prisma.client.findUnique({ where: { id } });
  },

  async create(data) {
    return await prisma.client.create({ data });
  },

  async update(id, data) {
    return await prisma.client.update({ where: { id }, data });
  },

  async delete(id) {
    return await prisma.client.delete({ where: { id } });
  },
};

// Invoice operations
export const invoiceOps = {
  async findAll() {
    const invoices = await prisma.invoice.findMany({ orderBy: { createdAt: 'desc' } });
    return invoices.map((inv) => ({
      ...inv,
      items: parseJson(inv.items, []),
    }));
  },

  async findById(id) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return null;
    return {
      ...invoice,
      items: parseJson(invoice.items, []),
    };
  },

  async findBySaleId(saleId) {
    if (!saleId) return null;
    const invoice = await prisma.invoice.findUnique({ where: { saleId } });
    if (!invoice) return null;
    return {
      ...invoice,
      items: parseJson(invoice.items, []),
    };
  },

  async create(data) {
    const invoice = await prisma.invoice.create({
      data: {
        ...data,
        items: stringifyJson(data.items || []),
      },
    });
    return {
      ...invoice,
      items: parseJson(invoice.items, []),
    };
  },

  async update(id, data) {
    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...data,
        items: data.items !== undefined ? stringifyJson(data.items) : undefined,
      },
    });
    return {
      ...invoice,
      items: parseJson(invoice.items, []),
    };
  },

  async delete(id) {
    return await prisma.invoice.delete({ where: { id } });
  },
};

// Sale operations
export const saleOps = {
  async findAll() {
    const sales = await prisma.sale.findMany({ orderBy: { createdAt: 'desc' } });
    return sales.map((sale) => ({
      ...sale,
      items: parseJson(sale.items, []),
    }));
  },

  async findById(id) {
    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale) return null;
    return {
      ...sale,
      items: parseJson(sale.items, []),
    };
  },

  async create(data) {
    const sale = await prisma.sale.create({
      data: {
        ...data,
        items: stringifyJson(data.items || []),
      },
    });
    return {
      ...sale,
      items: parseJson(sale.items, []),
    };
  },

  async update(id, data) {
    const sale = await prisma.sale.update({
      where: { id },
      data: {
        ...data,
        items: data.items !== undefined ? stringifyJson(data.items) : undefined,
      },
    });
    return {
      ...sale,
      items: parseJson(sale.items, []),
    };
  },

  async delete(id) {
    return await prisma.sale.delete({ where: { id } });
  },
};

// Invitation operations
export const invitationOps = {
  async findAllByTeam(teamId) {
    const invitations = await prisma.invitation.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((inv) => ({
      ...inv,
      allowedPages: parseJson(inv.allowedPages),
      allowedWarehouseIds: parseJson(inv.allowedWarehouseIds),
    }));
  },

  async findByToken(token) {
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation) return null;
    return {
      ...invitation,
      allowedPages: parseJson(invitation.allowedPages),
      allowedWarehouseIds: parseJson(invitation.allowedWarehouseIds),
    };
  },

  async create(data) {
    const invitation = await prisma.invitation.create({
      data: {
        ...data,
        allowedPages: stringifyJson(data.allowedPages),
        allowedWarehouseIds: stringifyJson(data.allowedWarehouseIds),
      },
    });
    return {
      ...invitation,
      allowedPages: parseJson(invitation.allowedPages),
      allowedWarehouseIds: parseJson(invitation.allowedWarehouseIds),
    };
  },

  async update(id, data) {
    const invitation = await prisma.invitation.update({
      where: { id },
      data: {
        ...data,
        allowedPages:
          data.allowedPages !== undefined ? stringifyJson(data.allowedPages) : undefined,
        allowedWarehouseIds:
          data.allowedWarehouseIds !== undefined
            ? stringifyJson(data.allowedWarehouseIds)
            : undefined,
      },
    });
    return {
      ...invitation,
      allowedPages: parseJson(invitation.allowedPages),
      allowedWarehouseIds: parseJson(invitation.allowedWarehouseIds),
    };
  },

  async delete(id) {
    await prisma.invitation.delete({ where: { id } });
  },

  async findById(id) {
    const invitation = await prisma.invitation.findUnique({ where: { id } });
    if (!invitation) return null;
    return {
      ...invitation,
      allowedPages: parseJson(invitation.allowedPages),
      allowedWarehouseIds: parseJson(invitation.allowedWarehouseIds),
    };
  },
};

export { prisma };
