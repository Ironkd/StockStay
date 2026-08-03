import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import {
  provisionOrganizationWithTeam,
  ensureDefaultStockLocation,
} from "../../db.js";

const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-harness";
export const TEST_PASSWORD = "TestPass1!";

let seq = 0;
function next(label = "x") {
  seq += 1;
  return `${label}${seq}-${Date.now().toString(36)}`;
}

export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * Create verified owner with org+team+default stock location.
 * @param {{ plan?: string, email?: string, name?: string, teamRole?: string }} [opts]
 */
export async function createOwnerContext(opts = {}) {
  const email = (opts.email || `${next("owner")}@example.com`).toLowerCase();
  const name = opts.name || "Test Owner";
  const passwordHash = await bcrypt.hash(opts.password || TEST_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      name,
      password: passwordHash,
      emailVerified: true,
    },
  });

  const { organization, team, membership, stockLocation } =
    await provisionOrganizationWithTeam({
      ownerUserId: user.id,
      organizationName: opts.orgName || `${name}'s Organization`,
      teamName: opts.teamName || `${name}'s Team`,
    });

  if (opts.plan && opts.plan !== "free") {
    await prisma.organization.update({
      where: { id: organization.id },
      data: { plan: opts.plan },
    });
    organization.plan = opts.plan;
  }

  const token = signToken(user);
  return {
    user,
    organization,
    team,
    membership,
    stockLocation: stockLocation || (await ensureDefaultStockLocation(team.id)),
    token,
    password: opts.password || TEST_PASSWORD,
  };
}

/**
 * Add a member/viewer to an existing team.
 */
export async function createTeamMember(teamId, opts = {}) {
  const email = (opts.email || `${next("member")}@example.com`).toLowerCase();
  const passwordHash = await bcrypt.hash(opts.password || TEST_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      name: opts.name || "Team Member",
      password: passwordHash,
      emailVerified: true,
      activeTeamId: teamId,
    },
  });
  const membership = await prisma.userMembership.create({
    data: {
      userId: user.id,
      teamId,
      teamRole: opts.teamRole || "member",
      maxInventoryItems: opts.maxInventoryItems ?? null,
      allowedPages: opts.allowedPages ? JSON.stringify(opts.allowedPages) : null,
      allowedPropertyIds: opts.allowedPropertyIds
        ? JSON.stringify(opts.allowedPropertyIds)
        : null,
    },
  });
  return { user, membership, token: signToken(user), password: opts.password || TEST_PASSWORD };
}

export async function createClient(teamId, opts = {}) {
  return prisma.client.create({
    data: {
      teamId,
      name: opts.name || `Client ${next("c")}`,
      email: opts.email || `${next("client")}@example.com`,
      billingFrequency: opts.billingFrequency || "monthly_eom",
      defaultMarkupPercentage: opts.defaultMarkupPercentage ?? 0,
    },
  });
}

export async function createProperty(teamId, opts = {}) {
  return prisma.property.create({
    data: {
      teamId,
      name: opts.name || `Property ${next("p")}`,
      location: opts.location || "123 Test St",
      clientId: opts.clientId || null,
      markupPercentage: opts.markupPercentage ?? null,
    },
  });
}

export async function linkLocationToProperty(stockLocationId, propertyId) {
  return prisma.stockLocationProperty.create({
    data: { stockLocationId, propertyId },
  });
}

export async function createSupplyItem(teamId, opts = {}) {
  const baseUnitId = opts.baseUnitId || "uom_ea";
  return prisma.supplyItem.create({
    data: {
      teamId,
      name: opts.name || `Supply ${next("s")}`,
      category: opts.category || "",
      baseUnitId,
      defaultReorderPoint: opts.defaultReorderPoint ?? 10,
      defaultReorderQuantity: opts.defaultReorderQuantity ?? 20,
    },
  });
}

export async function createSku(teamId, supplyItemId, opts = {}) {
  const packSize = opts.packSize ?? 10;
  const purchasePrice = opts.purchasePrice ?? 10;
  const unitRate =
    opts.unitRate ?? Number(purchasePrice) / Number(packSize);
  return prisma.sku.create({
    data: {
      teamId,
      supplyItemId,
      name: opts.name || `SKU ${next("sku")}`,
      supplier: opts.supplier || "Test Supplier",
      packSize,
      purchasePrice,
      unitRate,
    },
  });
}

export async function ensureSkuAtLocation(skuId, stockLocationId) {
  const existing = await prisma.stockOnHand.findUnique({
    where: {
      skuId_stockLocationId: { skuId, stockLocationId },
    },
  });
  if (existing) return existing;
  return prisma.stockOnHand.create({
    data: {
      skuId,
      stockLocationId,
      quantity: 0,
      lastUnitRate: null,
    },
  });
}

/** Full catalogue + property linked for replenishment tests. */
export async function createStockScenario(ownerOpts = {}) {
  const ctx = await createOwnerContext({ plan: "pro", ...ownerOpts });
  const client = await createClient(ctx.team.id, {
    billingFrequency: "weekly",
    defaultMarkupPercentage: 10,
  });
  const property = await createProperty(ctx.team.id, {
    clientId: client.id,
    markupPercentage: 20,
  });
  await linkLocationToProperty(ctx.stockLocation.id, property.id);
  const supplyItem = await createSupplyItem(ctx.team.id, { name: `Pods ${next("pods")}` });
  const sku = await createSku(ctx.team.id, supplyItem.id, {
    packSize: 10,
    purchasePrice: 10,
  });
  await ensureSkuAtLocation(sku.id, ctx.stockLocation.id);
  return { ...ctx, client, property, supplyItem, sku };
}
