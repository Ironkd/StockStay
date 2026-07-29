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
import { qtyStr, moneyStr } from './decimalUtil.js';

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
  console.log('🔌 Using PostgreSQL');
} else {
  throw new Error(
    'DATABASE_URL must be a PostgreSQL URL (Docker local or Supabase). ' +
    'Example: postgresql://stockstay:stockstay@localhost:5432/stockstay'
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

function mapUser(user) {
  if (!user) return null;
  return { ...user };
}

function mapMembership(m) {
  if (!m) return null;
  return {
    ...m,
    allowedPages: parseJson(m.allowedPages),
    allowedPropertyIds: parseJson(m.allowedPropertyIds),
  };
}

// User operations
export const userOps = {
  async findById(id) {
    const user = await prisma.user.findUnique({ where: { id } });
    return mapUser(user);
  },

  async findByEmail(email) {
    if (!email || typeof email !== "string") return null;
    const normalized = email.trim().toLowerCase();
    let user = null;
    try {
      user = await prisma.user.findFirst({
        where: { email: { equals: normalized, mode: "insensitive" } },
        orderBy: { updatedAt: "desc" },
      });
    } catch (err) {
      console.warn("findByEmail: case-insensitive lookup failed, trying exact match:", err.message);
      user = await prisma.user.findUnique({ where: { email: normalized } });
      if (!user) user = await prisma.user.findUnique({ where: { email: email.trim() } });
    }
    return mapUser(user);
  },

  async findByEmailVerificationToken(token) {
    if (!token) return null;
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiresAt: { gt: new Date() },
      },
    });
    return mapUser(user);
  },

  async create(data) {
    const user = await prisma.user.create({ data });
    return mapUser(user);
  },

  async update(id, data) {
    const user = await prisma.user.update({ where: { id }, data });
    return mapUser(user);
  },
};

export const organizationOps = {
  async findById(id) {
    if (!id) return null;
    return prisma.organization.findUnique({ where: { id } });
  },

  async create(data) {
    return prisma.organization.create({ data });
  },

  async update(id, data) {
    return prisma.organization.update({ where: { id }, data });
  },
};

export const membershipOps = {
  async findByUserAndTeam(userId, teamId) {
    if (!userId || !teamId) return null;
    const m = await prisma.userMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    return mapMembership(m);
  },

  async findAllByUser(userId) {
    const rows = await prisma.userMembership.findMany({
      where: { userId },
      include: { team: { include: { organization: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((m) => ({
      ...mapMembership(m),
      team: m.team,
    }));
  },

  async findAllByTeam(teamId) {
    const rows = await prisma.userMembership.findMany({
      where: { teamId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((m) => ({
      ...mapMembership(m),
      user: m.user,
    }));
  },

  async countByTeam(teamId) {
    return prisma.userMembership.count({ where: { teamId } });
  },

  async create(data) {
    const m = await prisma.userMembership.create({
      data: {
        ...data,
        allowedPages: stringifyJson(data.allowedPages),
        allowedPropertyIds: stringifyJson(data.allowedPropertyIds),
      },
    });
    return mapMembership(m);
  },

  async update(id, data) {
    const m = await prisma.userMembership.update({
      where: { id },
      data: {
        ...data,
        allowedPages: data.allowedPages !== undefined ? stringifyJson(data.allowedPages) : undefined,
        allowedPropertyIds:
          data.allowedPropertyIds !== undefined
            ? stringifyJson(data.allowedPropertyIds)
            : undefined,
      },
    });
    return mapMembership(m);
  },

  async upsertForUserTeam(userId, teamId, data) {
    const m = await prisma.userMembership.upsert({
      where: { userId_teamId: { userId, teamId } },
      create: {
        userId,
        teamId,
        teamRole: data.teamRole || "member",
        maxInventoryItems: data.maxInventoryItems ?? null,
        allowedPages: stringifyJson(data.allowedPages),
        allowedPropertyIds: stringifyJson(data.allowedPropertyIds),
      },
      update: {
        teamRole: data.teamRole !== undefined ? data.teamRole : undefined,
        maxInventoryItems: data.maxInventoryItems !== undefined ? data.maxInventoryItems : undefined,
        allowedPages: data.allowedPages !== undefined ? stringifyJson(data.allowedPages) : undefined,
        allowedPropertyIds:
          data.allowedPropertyIds !== undefined
            ? stringifyJson(data.allowedPropertyIds)
            : undefined,
      },
    });
    return mapMembership(m);
  },

  async deleteByUserAndTeam(userId, teamId) {
    await prisma.userMembership.deleteMany({ where: { userId, teamId } });
  },
};

export const DEFAULT_STOCK_LOCATION_NAME = "Central supply";

/**
 * Ensure the team has at least one stock location (default: "Central supply").
 * Idempotent for empty teams; does not create a second default if any location exists.
 */
export async function ensureDefaultStockLocation(teamId) {
  if (!teamId) return null;
  const existing = await prisma.stockLocation.findFirst({
    where: { teamId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return mapStockLocation(existing);
  const row = await prisma.stockLocation.create({
    data: {
      teamId,
      name: DEFAULT_STOCK_LOCATION_NAME,
      address: null,
      tags: [],
    },
    include: {
      properties: { include: { property: true } },
    },
  });
  return mapStockLocation(row);
}

/**
 * Create Organization + Team + owner membership and set activeTeamId.
 * Also creates the default "Central supply" stock location.
 * @returns {{ organization, team, membership, stockLocation }}
 */
export async function provisionOrganizationWithTeam({
  ownerUserId,
  organizationName,
  teamName,
}) {
  const organization = await organizationOps.create({
    name: organizationName,
    ownerId: ownerUserId,
    plan: "free",
  });
  const team = await teamOps.create({
    name: teamName || organizationName,
    ownerId: ownerUserId,
    organizationId: organization.id,
  });
  const membership = await membershipOps.create({
    userId: ownerUserId,
    teamId: team.id,
    teamRole: "owner",
  });
  await userOps.update(ownerUserId, { activeTeamId: team.id });
  const stockLocation = await ensureDefaultStockLocation(team.id);
  return { organization, team, membership, stockLocation };
}

/**
 * Full membership context for the user's active team.
 * Enriched user includes teamId alias (= activeTeamId) and role/scopes from membership
 * so existing API handlers can keep using currentUser.teamId / teamRole / allowedPages.
 */
export async function getMembershipContext(userId) {
  const user = await userOps.findById(userId);
  if (!user) return null;

  let activeTeamId = user.activeTeamId;
  let membership = activeTeamId
    ? await membershipOps.findByUserAndTeam(userId, activeTeamId)
    : null;

  if (activeTeamId && !membership) {
    activeTeamId = null;
  }

  if (!activeTeamId) {
    const memberships = await membershipOps.findAllByUser(userId);
    if (memberships.length > 0) {
      activeTeamId = memberships[0].teamId;
      membership = memberships[0];
      await userOps.update(userId, { activeTeamId });
      user.activeTeamId = activeTeamId;
    }
  }

  const team = activeTeamId ? await teamOps.findById(activeTeamId) : null;
  const organization = team?.organizationId
    ? await organizationOps.findById(team.organizationId)
    : null;

  const allMemberships = await membershipOps.findAllByUser(userId);
  const membershipSummaries = allMemberships.map((m) => ({
    teamId: m.teamId,
    teamName: m.team?.name ?? null,
    teamRole: m.teamRole,
    organizationId: m.team?.organizationId ?? null,
    organizationName: m.team?.organization?.name ?? null,
  }));

  const enrichedUser = {
    ...user,
    teamId: activeTeamId,
    teamRole: membership?.teamRole ?? null,
    maxInventoryItems: membership?.maxInventoryItems ?? null,
    allowedPages: membership?.allowedPages ?? null,
    allowedPropertyIds: membership?.allowedPropertyIds ?? null,
    organizationId: organization?.id ?? null,
    isOrgOwner: organization ? organization.ownerId === userId : false,
  };

  return {
    user: enrichedUser,
    membership,
    team,
    organization,
    memberships: membershipSummaries,
  };
}

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
    if (!id) return null;
    try {
      return await prisma.team.findUnique({
        where: { id },
        include: { organization: true },
      });
    } catch (err) {
      console.warn("teamOps.findById failed:", err.message);
      return null;
    }
  },

  async create(data) {
    return await prisma.team.create({ data });
  },

  async update(id, data) {
    return await prisma.team.update({ where: { id }, data });
  },

  async findAllByOrganization(organizationId) {
    return prisma.team.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
  },
};

// Property operations
export const propertyOps = {
  async findAllByTeam(teamId) {
    return await prisma.property.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async countByTeam(teamId) {
    return await prisma.property.count({ where: { teamId } });
  },

  async createForTeam(teamId, data) {
    const payload = {
      teamId,
      name: data.name,
      location: data.location || null,
    };
    if (data.clientId !== undefined) {
      payload.clientId = data.clientId || null;
    }
    if (data.markupPercentage !== undefined) {
      payload.markupPercentage =
        data.markupPercentage === null || data.markupPercentage === ""
          ? null
          : data.markupPercentage;
    }
    return await prisma.property.create({ data: payload });
  },

  async update(id, data) {
    const payload = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.location !== undefined) payload.location = data.location;
    if (data.clientId !== undefined) payload.clientId = data.clientId || null;
    if (data.markupPercentage !== undefined) {
      payload.markupPercentage =
        data.markupPercentage === null || data.markupPercentage === ""
          ? null
          : data.markupPercentage;
    }
    return await prisma.property.update({
      where: { id },
      data: payload,
    });
  },

  async delete(id) {
    // Note: inventory items referencing this property are NOT auto-deleted.
    // The app should prevent deleting properties that still have inventory.
    return await prisma.property.delete({ where: { id } });
  },
};

// Client operations (team-scoped)
export const clientOps = {
  async findAll(teamId) {
    const where = teamId != null ? { teamId } : {};
    return await prisma.client.findMany({ where, orderBy: { createdAt: 'desc' } });
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

// Invoice operations (team-scoped)
export const invoiceOps = {
  async findAll(teamId) {
    const where = teamId != null ? { teamId } : {};
    const invoices = await prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' } });
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
      allowedPropertyIds: parseJson(inv.allowedPropertyIds),
    }));
  },

  async findByToken(token) {
    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation) return null;
    return {
      ...invitation,
      allowedPages: parseJson(invitation.allowedPages),
      allowedPropertyIds: parseJson(invitation.allowedPropertyIds),
    };
  },

  async create(data) {
    const invitation = await prisma.invitation.create({
      data: {
        ...data,
        allowedPages: stringifyJson(data.allowedPages),
        allowedPropertyIds: stringifyJson(data.allowedPropertyIds),
      },
    });
    return {
      ...invitation,
      allowedPages: parseJson(invitation.allowedPages),
      allowedPropertyIds: parseJson(invitation.allowedPropertyIds),
    };
  },

  async update(id, data) {
    const invitation = await prisma.invitation.update({
      where: { id },
      data: {
        ...data,
        allowedPages:
          data.allowedPages !== undefined ? stringifyJson(data.allowedPages) : undefined,
        allowedPropertyIds:
          data.allowedPropertyIds !== undefined
            ? stringifyJson(data.allowedPropertyIds)
            : undefined,
      },
    });
    return {
      ...invitation,
      allowedPages: parseJson(invitation.allowedPages),
      allowedPropertyIds: parseJson(invitation.allowedPropertyIds),
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
      allowedPropertyIds: parseJson(invitation.allowedPropertyIds),
    };
  },
};

/** Catalogue qty fields: fixed 6 dp. Money fields: fixed 4 dp. */
function decimalToString(value, { money = false } = {}) {
  if (value == null) return null;
  try {
    return money ? moneyStr(value) : qtyStr(value);
  } catch {
    if (typeof value === "object" && typeof value.toString === "function") {
      return value.toString();
    }
    return String(value);
  }
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t));
  if (typeof tags === "string") {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapStockLocation(row) {
  if (!row) return null;
  return {
    ...row,
    tags: normalizeTags(row.tags),
    properties: Array.isArray(row.properties)
      ? row.properties.map((link) => ({
          id: link.id,
          propertyId: link.propertyId,
          property: link.property
            ? { id: link.property.id, name: link.property.name, location: link.property.location }
            : undefined,
        }))
      : undefined,
  };
}

function mapSupplyItem(row) {
  if (!row) return null;
  return {
    ...row,
    defaultReorderPoint: decimalToString(row.defaultReorderPoint),
    defaultReorderQuantity: decimalToString(row.defaultReorderQuantity),
    baseUnit: row.baseUnit
      ? {
          id: row.baseUnit.id,
          code: row.baseUnit.code,
          name: row.baseUnit.name,
          dimension: row.baseUnit.dimension,
        }
      : undefined,
  };
}

function mapStockOnHand(row) {
  if (!row) return null;
  return {
    id: row.id,
    skuId: row.skuId,
    stockLocationId: row.stockLocationId,
    quantity: decimalToString(row.quantity),
    lastPurchasePrice:
      row.lastPurchasePrice != null
        ? decimalToString(row.lastPurchasePrice, { money: true })
        : null,
    lastUnitRate: row.lastUnitRate != null ? decimalToString(row.lastUnitRate) : null,
    stockLocation: row.stockLocation
      ? { id: row.stockLocation.id, name: row.stockLocation.name }
      : undefined,
  };
}

function mapSku(row, { stockLocationId } = {}) {
  if (!row) return null;
  const hands = Array.isArray(row.stockOnHands)
    ? row.stockOnHands
    : row.stockOnHand
      ? [row.stockOnHand]
      : [];
  let stockOnHand;
  if (stockLocationId) {
    const match = hands.find((h) => h.stockLocationId === stockLocationId);
    stockOnHand = mapStockOnHand(match);
  } else if (hands.length === 1) {
    stockOnHand = mapStockOnHand(hands[0]);
  } else {
    stockOnHand = undefined;
  }
  return {
    id: row.id,
    teamId: row.teamId,
    supplyItemId: row.supplyItemId,
    name: row.name,
    supplier: row.supplier,
    packSize: decimalToString(row.packSize),
    purchasePrice: decimalToString(row.purchasePrice, { money: true }),
    unitRate: decimalToString(row.unitRate),
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stockOnHand,
    stockOnHands: hands.map(mapStockOnHand),
    supplyItem: row.supplyItem
      ? {
          id: row.supplyItem.id,
          name: row.supplyItem.name,
          category: row.supplyItem.category,
          baseUnitId: row.supplyItem.baseUnitId,
        }
      : undefined,
  };
}

export const unitOfMeasureOps = {
  async findAll() {
    return prisma.unitOfMeasure.findMany({ orderBy: { code: "asc" } });
  },

  async findById(id) {
    if (!id) return null;
    return prisma.unitOfMeasure.findUnique({ where: { id } });
  },

  async findByCode(code) {
    if (!code) return null;
    return prisma.unitOfMeasure.findUnique({ where: { code } });
  },
};

export const stockLocationOps = {
  async findAllByTeam(teamId, { includeArchived = false } = {}) {
    const rows = await prisma.stockLocation.findMany({
      where: {
        teamId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: {
        properties: { include: { property: true } },
      },
      orderBy: { name: "asc" },
    });
    return rows.map(mapStockLocation);
  },

  async findById(id) {
    if (!id) return null;
    const row = await prisma.stockLocation.findUnique({
      where: { id },
      include: {
        properties: { include: { property: true } },
      },
    });
    return mapStockLocation(row);
  },

  async create(data) {
    const row = await prisma.stockLocation.create({
      data: {
        teamId: data.teamId,
        name: data.name,
        address: data.address ?? null,
        tags: normalizeTags(data.tags),
      },
      include: {
        properties: { include: { property: true } },
      },
    });
    return mapStockLocation(row);
  },

  async update(id, data) {
    const row = await prisma.stockLocation.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.tags !== undefined ? { tags: normalizeTags(data.tags) } : {}),
        ...(data.archivedAt !== undefined ? { archivedAt: data.archivedAt } : {}),
      },
      include: {
        properties: { include: { property: true } },
      },
    });
    return mapStockLocation(row);
  },

  async linkProperty(stockLocationId, propertyId) {
    const link = await prisma.stockLocationProperty.create({
      data: { stockLocationId, propertyId },
      include: { property: true },
    });
    return {
      id: link.id,
      propertyId: link.propertyId,
      property: link.property
        ? { id: link.property.id, name: link.property.name, location: link.property.location }
        : undefined,
    };
  },

  async unlinkProperty(stockLocationId, propertyId) {
    await prisma.stockLocationProperty.deleteMany({
      where: { stockLocationId, propertyId },
    });
  },
};

export const supplyItemOps = {
  async findAllByTeam(teamId, { includeArchived = false } = {}) {
    const rows = await prisma.supplyItem.findMany({
      where: {
        teamId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: { baseUnit: true },
      orderBy: { name: "asc" },
    });
    return rows.map(mapSupplyItem);
  },

  async findById(id) {
    if (!id) return null;
    const row = await prisma.supplyItem.findUnique({
      where: { id },
      include: { baseUnit: true },
    });
    return mapSupplyItem(row);
  },

  async create(data) {
    const row = await prisma.supplyItem.create({
      data: {
        teamId: data.teamId,
        name: data.name,
        category: data.category ?? "",
        baseUnitId: data.baseUnitId,
        defaultReorderPoint: data.defaultReorderPoint ?? 0,
        defaultReorderQuantity: data.defaultReorderQuantity ?? 0,
      },
      include: { baseUnit: true },
    });
    return mapSupplyItem(row);
  },

  async update(id, data) {
    const row = await prisma.supplyItem.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.baseUnitId !== undefined ? { baseUnitId: data.baseUnitId } : {}),
        ...(data.defaultReorderPoint !== undefined
          ? { defaultReorderPoint: data.defaultReorderPoint }
          : {}),
        ...(data.defaultReorderQuantity !== undefined
          ? { defaultReorderQuantity: data.defaultReorderQuantity }
          : {}),
        ...(data.archivedAt !== undefined ? { archivedAt: data.archivedAt } : {}),
      },
      include: { baseUnit: true },
    });
    return mapSupplyItem(row);
  },
};

export const skuOps = {
  async findAllByTeam(teamId, { includeArchived = false, supplyItemId, stockLocationId } = {}) {
    const rows = await prisma.sku.findMany({
      where: {
        teamId,
        ...(includeArchived ? {} : { archivedAt: null }),
        ...(supplyItemId ? { supplyItemId } : {}),
        ...(stockLocationId
          ? { stockOnHands: { some: { stockLocationId } } }
          : {}),
      },
      include: {
        stockOnHands: stockLocationId
          ? {
              where: { stockLocationId },
              include: { stockLocation: { select: { id: true, name: true } } },
            }
          : {
              include: { stockLocation: { select: { id: true, name: true } } },
            },
        supplyItem: true,
      },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => mapSku(row, { stockLocationId }));
  },

  async findById(id, { stockLocationId } = {}) {
    if (!id) return null;
    const row = await prisma.sku.findUnique({
      where: { id },
      include: {
        stockOnHands: {
          ...(stockLocationId ? { where: { stockLocationId } } : {}),
          include: { stockLocation: { select: { id: true, name: true } } },
        },
        supplyItem: true,
      },
    });
    return mapSku(row, { stockLocationId });
  },

  async create(data) {
    const row = await prisma.sku.create({
      data: {
        teamId: data.teamId,
        supplyItemId: data.supplyItemId,
        name: data.name,
        supplier: data.supplier ?? null,
        packSize: data.packSize,
        purchasePrice: data.purchasePrice,
        unitRate: data.unitRate,
      },
      include: {
        stockOnHands: {
          include: { stockLocation: { select: { id: true, name: true } } },
        },
        supplyItem: true,
      },
    });
    return mapSku(row);
  },

  async update(id, data) {
    const row = await prisma.sku.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.supplier !== undefined ? { supplier: data.supplier } : {}),
        ...(data.packSize !== undefined ? { packSize: data.packSize } : {}),
        ...(data.purchasePrice !== undefined ? { purchasePrice: data.purchasePrice } : {}),
        ...(data.unitRate !== undefined ? { unitRate: data.unitRate } : {}),
        ...(data.archivedAt !== undefined ? { archivedAt: data.archivedAt } : {}),
      },
      include: {
        stockOnHands: {
          include: { stockLocation: { select: { id: true, name: true } } },
        },
        supplyItem: true,
      },
    });
    return mapSku(row);
  },

  async ensureStockOnHand(skuId, stockLocationId) {
    const existing = await prisma.stockOnHand.findUnique({
      where: {
        skuId_stockLocationId: { skuId, stockLocationId },
      },
      include: { stockLocation: { select: { id: true, name: true } } },
    });
    if (existing) return mapStockOnHand(existing);
    const created = await prisma.stockOnHand.create({
      data: {
        skuId,
        stockLocationId,
        quantity: 0,
      },
      include: { stockLocation: { select: { id: true, name: true } } },
    });
    return mapStockOnHand(created);
  },
};

export { prisma };
