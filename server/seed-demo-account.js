import { prisma, ensureDefaultStockLocation, provisionOrganizationWithTeam } from "./db.js";
import { receiveStock, locationSupplyThresholdOps } from "./stockLedger.js";
import { createReplenishment, createReturn } from "./replenishment.js";
import { generateDraftInvoicesForTeam } from "./clientBilling.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function daysAgo(days, hour = 15) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

function daysAhead(days, hour = 15) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

async function ensureTeamContext(user) {
  const memberships = await prisma.userMembership.findMany({
    where: { userId: user.id },
    include: { team: { include: { organization: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    const displayName = (user.name || user.email.split("@")[0] || "My").trim();
    const provisioned = await provisionOrganizationWithTeam({
      ownerUserId: user.id,
      organizationName: `${displayName}'s Organization`,
      teamName: `${displayName}'s Team`,
    });
    return {
      team: provisioned.team,
      organization: provisioned.organization,
      membership: provisioned.membership,
      stockLocation: provisioned.stockLocation,
    };
  }

  const activeTeamId = user.activeTeamId || memberships[0].teamId;
  if (user.activeTeamId !== activeTeamId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { activeTeamId },
    });
  }

  const membership = memberships.find((row) => row.teamId === activeTeamId) || memberships[0];
  const team = membership.team;
  const organization =
    team.organization ||
    (await prisma.organization.findUnique({ where: { id: team.organizationId } }));
  const stockLocation = await ensureDefaultStockLocation(team.id);

  return { team, organization, membership, stockLocation };
}

async function ensureStockLocation(teamId, { name, address, tags }) {
  const existing = await prisma.stockLocation.findFirst({
    where: { teamId, name },
  });
  if (existing) {
    return prisma.stockLocation.update({
      where: { id: existing.id },
      data: {
        address: address ?? existing.address,
        tags: tags ?? existing.tags,
        archivedAt: null,
      },
    });
  }
  return prisma.stockLocation.create({
    data: {
      teamId,
      name,
      address: address ?? null,
      tags: tags ?? [],
    },
  });
}

async function ensureClient(teamId, client) {
  const existing = await prisma.client.findFirst({
    where: { teamId, name: client.name },
  });
  if (existing) {
    return prisma.client.update({
      where: { id: existing.id },
      data: client,
    });
  }
  return prisma.client.create({
    data: {
      teamId,
      ...client,
    },
  });
}

async function ensureProperty(teamId, property) {
  const existing = await prisma.property.findFirst({
    where: { teamId, name: property.name },
  });
  if (existing) {
    return prisma.property.update({
      where: { id: existing.id },
      data: property,
    });
  }
  return prisma.property.create({
    data: {
      teamId,
      ...property,
    },
  });
}

async function ensureLocationLink(stockLocationId, propertyId) {
  const existing = await prisma.stockLocationProperty.findUnique({
    where: {
      stockLocationId_propertyId: { stockLocationId, propertyId },
    },
  });
  if (existing) return existing;
  return prisma.stockLocationProperty.create({
    data: { stockLocationId, propertyId },
  });
}

async function ensureSupplyItem(teamId, item) {
  const existing = await prisma.supplyItem.findFirst({
    where: { teamId, name: item.name },
  });
  if (existing) {
    return prisma.supplyItem.update({
      where: { id: existing.id },
      data: item,
    });
  }
  return prisma.supplyItem.create({
    data: {
      teamId,
      ...item,
    },
  });
}

async function ensureSku(teamId, supplyItemId, sku) {
  const existing = await prisma.sku.findFirst({
    where: { teamId, name: sku.name },
  });
  if (existing) {
    return prisma.sku.update({
      where: { id: existing.id },
      data: {
        supplyItemId,
        ...sku,
      },
    });
  }
  return prisma.sku.create({
    data: {
      teamId,
      supplyItemId,
      ...sku,
    },
  });
}

async function stampReplenishment(replenishmentId, when) {
  await prisma.replenishment.update({
    where: { id: replenishmentId },
    data: { createdAt: when },
  });
  await prisma.replenishmentLine.updateMany({
    where: { replenishmentId },
    data: { createdAt: when },
  });
  await prisma.stockTransaction.updateMany({
    where: {
      referenceType: "replenishment",
      referenceId: replenishmentId,
    },
    data: {
      createdAt: when,
      effectiveAt: when,
    },
  });
}

async function clearTeamWorkspace(teamId) {
  const propertyIds = (
    await prisma.property.findMany({
      where: { teamId },
      select: { id: true },
    })
  ).map((row) => row.id);

  await prisma.invoiceLine.deleteMany({
    where: {
      OR: [
        { invoice: { teamId } },
        propertyIds.length > 0 ? { propertyId: { in: propertyIds } } : undefined,
      ].filter(Boolean),
    },
  });
  await prisma.invoice.deleteMany({ where: { teamId } });
  await prisma.replenishmentLine.deleteMany({
    where: { replenishment: { teamId } },
  });
  await prisma.replenishment.deleteMany({ where: { teamId } });
  await prisma.stockTransaction.deleteMany({ where: { teamId } });
  await prisma.stockOnHand.deleteMany({
    where: { stockLocation: { teamId } },
  });
  await prisma.locationSupplyThreshold.deleteMany({
    where: { stockLocation: { teamId } },
  });
  await prisma.sku.deleteMany({ where: { teamId } });
  await prisma.supplyItem.deleteMany({ where: { teamId } });
  await prisma.stockLocationProperty.deleteMany({
    where: {
      OR: [
        { stockLocation: { teamId } },
        propertyIds.length > 0 ? { propertyId: { in: propertyIds } } : undefined,
      ].filter(Boolean),
    },
  });
  await prisma.stockLocation.deleteMany({ where: { teamId } });
  await prisma.property.deleteMany({ where: { teamId } });
  await prisma.client.deleteMany({ where: { teamId } });
}

async function ensureSeedableWorkspace(teamId, force) {
  const [propertyCount, supplyItemCount, replenishmentCount, invoiceCount, transactionCount] =
    await Promise.all([
      prisma.property.count({ where: { teamId } }),
      prisma.supplyItem.count({ where: { teamId } }),
      prisma.replenishment.count({ where: { teamId } }),
      prisma.invoice.count({ where: { teamId } }),
      prisma.stockTransaction.count({ where: { teamId } }),
    ]);

  const hasData =
    propertyCount > 0 ||
    supplyItemCount > 0 ||
    replenishmentCount > 0 ||
    invoiceCount > 0 ||
    transactionCount > 0;

  if (!hasData) return;

  if (!force) {
    throw new Error(
      "This team already has inventory/billing data. Re-run with --force to replace the team workspace with fresh demo data."
    );
  }

  await clearTeamWorkspace(teamId);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const force = rawArgs.includes("--force");
  const emailArg = rawArgs.find((value) => !value.startsWith("--"));
  const email = normalizeEmail(emailArg);

  if (!email) {
    console.error("Usage: node seed-demo-account.js <email> [--force]");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  const activatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    },
  });

  const ctx = await ensureTeamContext(activatedUser);
  await ensureSeedableWorkspace(ctx.team.id, force);

  await prisma.organization.update({
    where: { id: ctx.organization.id },
    data: {
      plan: "pro",
      isOnTrial: true,
      trialPlan: "pro",
      trialEndsAt: daysAhead(21),
    },
  });
  await prisma.userMembership.update({
    where: { id: ctx.membership.id },
    data: {
      teamRole: "owner",
      maxInventoryItems: null,
    },
  });
  await prisma.team.update({
    where: { id: ctx.team.id },
    data: {
      billingTimezone: "America/Toronto",
      createdAt: daysAgo(90, 12),
    },
  });

  const eachUnit = await prisma.unitOfMeasure.findUnique({
    where: { code: "ea" },
  });
  if (!eachUnit) {
    throw new Error('Expected UnitOfMeasure with code "ea" to exist.');
  }

  const centralSupply = await ensureStockLocation(ctx.team.id, {
    name: "Central supply",
    address: "Warehouse - 18 Harbour Rd, Toronto, ON",
    tags: ["warehouse", "main"],
  });
  const northSupply = await ensureStockLocation(ctx.team.id, {
    name: "North supply closet",
    address: "2nd floor storage - 155 King St W, Toronto, ON",
    tags: ["closet", "quick-picks"],
  });
  const linenCage = await ensureStockLocation(ctx.team.id, {
    name: "Linen cage",
    address: "Basement secure storage - 22 Front St E, Toronto, ON",
    tags: ["linens", "bulk"],
  });

  const clients = {
    blueTide: await ensureClient(ctx.team.id, {
      name: "Blue Tide Vacations",
      email: "ops@bluetidevacations.com",
      phone: "416-555-0131",
      company: "Blue Tide Vacations",
      streetAddress: "410 Queens Quay W",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 3T1",
      country: "Canada",
      notes: "Prefers monthly consolidated billing with property-level detail.",
      defaultMarkupPercentage: 18,
      billingFrequency: "monthly_eom",
    }),
    urbanNest: await ensureClient(ctx.team.id, {
      name: "Urban Nest Co.",
      email: "finance@urbannest.co",
      phone: "647-555-0142",
      company: "Urban Nest Co.",
      streetAddress: "85 Richmond St W",
      city: "Toronto",
      province: "ON",
      postalCode: "M5H 2C9",
      country: "Canada",
      notes: "Weekly restock for higher-turnover downtown units.",
      defaultMarkupPercentage: 15,
      billingFrequency: "weekly",
    }),
    stayWell: await ensureClient(ctx.team.id, {
      name: "StayWell Homes",
      email: "ap@staywellhomes.ca",
      phone: "905-555-0164",
      company: "StayWell Homes",
      streetAddress: "220 Lakeshore Rd E",
      city: "Oakville",
      province: "ON",
      postalCode: "L6J 1H8",
      country: "Canada",
      notes: "Biweekly billing for suburban family properties.",
      defaultMarkupPercentage: 22,
      billingFrequency: "biweekly",
    }),
  };

  const properties = {
    harborView: await ensureProperty(ctx.team.id, {
      name: "Harbor View Loft",
      location: "18 Harbour Rd, Toronto",
      clientId: clients.blueTide.id,
      markupPercentage: 20,
    }),
    mapleStreet: await ensureProperty(ctx.team.id, {
      name: "Maple Street Suite",
      location: "42 Maple St, Toronto",
      clientId: clients.blueTide.id,
      markupPercentage: 18,
    }),
    cedarPeak: await ensureProperty(ctx.team.id, {
      name: "Cedar Peak Chalet",
      location: "77 King St W, Toronto",
      clientId: clients.urbanNest.id,
      markupPercentage: 15,
    }),
    riverside: await ensureProperty(ctx.team.id, {
      name: "Riverside Retreat",
      location: "11 Riverbank Dr, Oakville",
      clientId: clients.stayWell.id,
      markupPercentage: 22,
    }),
  };

  await Promise.all([
    ensureLocationLink(centralSupply.id, properties.harborView.id),
    ensureLocationLink(centralSupply.id, properties.mapleStreet.id),
    ensureLocationLink(centralSupply.id, properties.cedarPeak.id),
    ensureLocationLink(centralSupply.id, properties.riverside.id),
    ensureLocationLink(northSupply.id, properties.cedarPeak.id),
    ensureLocationLink(northSupply.id, properties.riverside.id),
    ensureLocationLink(linenCage.id, properties.harborView.id),
    ensureLocationLink(linenCage.id, properties.mapleStreet.id),
  ]);

  const itemSpecs = [
    {
      key: "coffeePods",
      item: {
        name: "Coffee Pods",
        category: "Kitchen",
        baseUnitId: eachUnit.id,
        defaultReorderPoint: 120,
        defaultReorderQuantity: 240,
      },
      sku: {
        name: "Nespresso Original 50ct",
        supplier: "Bean Merchant Co.",
        packSize: 50,
        purchasePrice: 32.5,
        unitRate: 0.65,
      },
      receipts: [
        { stockLocationId: centralSupply.id, packQty: 5, purchasePrice: 32.5, purchasedAt: daysAgo(50, 13) },
      ],
    },
    {
      key: "paperTowels",
      item: {
        name: "Paper Towels",
        category: "Cleaning",
        baseUnitId: eachUnit.id,
        defaultReorderPoint: 36,
        defaultReorderQuantity: 72,
      },
      sku: {
        name: "Bounty Double Roll 12pk",
        supplier: "Warehouse Club",
        packSize: 12,
        purchasePrice: 24,
        unitRate: 2,
      },
      receipts: [
        { stockLocationId: centralSupply.id, packQty: 6, purchasePrice: 24, purchasedAt: daysAgo(42, 11) },
        { stockLocationId: northSupply.id, packQty: 2, purchasePrice: 24, purchasedAt: daysAgo(12, 11) },
      ],
    },
    {
      key: "toiletPaper",
      item: {
        name: "Toilet Paper",
        category: "Bathroom",
        baseUnitId: eachUnit.id,
        defaultReorderPoint: 48,
        defaultReorderQuantity: 96,
      },
      sku: {
        name: "Charmin Ultra Soft 24pk",
        supplier: "Warehouse Club",
        packSize: 24,
        purchasePrice: 28,
        unitRate: 1.166667,
      },
      receipts: [
        { stockLocationId: centralSupply.id, packQty: 5, purchasePrice: 28, purchasedAt: daysAgo(45, 11) },
        { stockLocationId: northSupply.id, packQty: 2, purchasePrice: 28, purchasedAt: daysAgo(16, 11) },
      ],
    },
    {
      key: "handSoap",
      item: {
        name: "Hand Soap",
        category: "Bathroom",
        baseUnitId: eachUnit.id,
        defaultReorderPoint: 18,
        defaultReorderQuantity: 36,
      },
      sku: {
        name: "Method Gel Hand Soap 6pk",
        supplier: "Clean Living Supply",
        packSize: 6,
        purchasePrice: 18,
        unitRate: 3,
      },
      receipts: [
        { stockLocationId: centralSupply.id, packQty: 3, purchasePrice: 18, purchasedAt: daysAgo(28, 10) },
      ],
    },
    {
      key: "shampoo",
      item: {
        name: "Shampoo Bottles",
        category: "Amenities",
        baseUnitId: eachUnit.id,
        defaultReorderPoint: 96,
        defaultReorderQuantity: 192,
      },
      sku: {
        name: "Travel Shampoo 48ct",
        supplier: "Guest Essentials",
        packSize: 48,
        purchasePrice: 34.56,
        unitRate: 0.72,
      },
      receipts: [
        { stockLocationId: centralSupply.id, packQty: 4, purchasePrice: 34.56, purchasedAt: daysAgo(38, 9) },
      ],
    },
    {
      key: "dishTabs",
      item: {
        name: "Dishwasher Tabs",
        category: "Kitchen",
        baseUnitId: eachUnit.id,
        defaultReorderPoint: 62,
        defaultReorderQuantity: 124,
      },
      sku: {
        name: "Cascade Platinum 62ct",
        supplier: "Warehouse Club",
        packSize: 62,
        purchasePrice: 25.42,
        unitRate: 0.41,
      },
      receipts: [
        { stockLocationId: centralSupply.id, packQty: 3, purchasePrice: 25.42, purchasedAt: daysAgo(34, 9) },
      ],
    },
    {
      key: "laundryPods",
      item: {
        name: "Laundry Pods",
        category: "Laundry",
        baseUnitId: eachUnit.id,
        defaultReorderPoint: 81,
        defaultReorderQuantity: 162,
      },
      sku: {
        name: "Tide Pods 81ct",
        supplier: "Clean Living Supply",
        packSize: 81,
        purchasePrice: 33.99,
        unitRate: 0.41963,
      },
      receipts: [
        { stockLocationId: centralSupply.id, packQty: 3, purchasePrice: 33.99, purchasedAt: daysAgo(25, 12) },
      ],
    },
    {
      key: "bathTowels",
      item: {
        name: "Bath Towel Set",
        category: "Linens",
        baseUnitId: eachUnit.id,
        defaultReorderPoint: 24,
        defaultReorderQuantity: 48,
      },
      sku: {
        name: "Premium White Towel Set 12pk",
        supplier: "Hospitality Linen Co.",
        packSize: 12,
        purchasePrice: 96,
        unitRate: 8,
      },
      receipts: [
        { stockLocationId: linenCage.id, packQty: 4, purchasePrice: 96, purchasedAt: daysAgo(60, 14) },
        { stockLocationId: centralSupply.id, packQty: 1, purchasePrice: 96, purchasedAt: daysAgo(18, 14) },
      ],
    },
    {
      key: "pillowProtectors",
      item: {
        name: "Pillow Protectors",
        category: "Linens",
        baseUnitId: eachUnit.id,
        defaultReorderPoint: 16,
        defaultReorderQuantity: 32,
      },
      sku: {
        name: "Zip Pillow Protector 8pk",
        supplier: "Hospitality Linen Co.",
        packSize: 8,
        purchasePrice: 44,
        unitRate: 5.5,
      },
      receipts: [
        { stockLocationId: linenCage.id, packQty: 3, purchasePrice: 44, purchasedAt: daysAgo(22, 14) },
        { stockLocationId: northSupply.id, packQty: 1, purchasePrice: 44, purchasedAt: daysAgo(18, 14) },
      ],
    },
  ];

  const items = {};
  for (const spec of itemSpecs) {
    const supplyItem = await ensureSupplyItem(ctx.team.id, spec.item);
    const sku = await ensureSku(ctx.team.id, supplyItem.id, spec.sku);
    items[spec.key] = { supplyItem, sku };

    for (const receipt of spec.receipts) {
      const result = await receiveStock({
        teamId: ctx.team.id,
        skuId: sku.id,
        stockLocationId: receipt.stockLocationId,
        packQty: receipt.packQty,
        purchasePrice: receipt.purchasePrice,
        purchasedAt: receipt.purchasedAt,
        userId: user.id,
        referenceType: "demo_seed",
        referenceId: user.id,
      });
      await prisma.stockTransaction.updateMany({
        where: { postingId: result.postingId },
        data: {
          createdAt: receipt.purchasedAt,
          effectiveAt: receipt.purchasedAt,
        },
      });
    }
  }

  await Promise.all([
    locationSupplyThresholdOps.upsert(ctx.team.id, centralSupply.id, items.coffeePods.supplyItem.id, {
      reorderPoint: 120,
      reorderQuantity: 200,
    }),
    locationSupplyThresholdOps.upsert(ctx.team.id, centralSupply.id, items.paperTowels.supplyItem.id, {
      reorderPoint: 36,
      reorderQuantity: 72,
    }),
    locationSupplyThresholdOps.upsert(ctx.team.id, centralSupply.id, items.toiletPaper.supplyItem.id, {
      reorderPoint: 48,
      reorderQuantity: 96,
    }),
    locationSupplyThresholdOps.upsert(ctx.team.id, centralSupply.id, items.shampoo.supplyItem.id, {
      reorderPoint: 96,
      reorderQuantity: 192,
    }),
    locationSupplyThresholdOps.upsert(ctx.team.id, northSupply.id, items.paperTowels.supplyItem.id, {
      reorderPoint: 30,
      reorderQuantity: 48,
    }),
    locationSupplyThresholdOps.upsert(ctx.team.id, northSupply.id, items.toiletPaper.supplyItem.id, {
      reorderPoint: 30,
      reorderQuantity: 48,
    }),
    locationSupplyThresholdOps.upsert(ctx.team.id, linenCage.id, items.bathTowels.supplyItem.id, {
      reorderPoint: 24,
      reorderQuantity: 36,
    }),
  ]);

  const julyReplenishment = await createReplenishment({
    teamId: ctx.team.id,
    stockLocationId: centralSupply.id,
    propertyId: properties.harborView.id,
    userId: user.id,
    lines: [
      { skuId: items.coffeePods.sku.id, baseQty: 30 },
      { skuId: items.shampoo.sku.id, baseQty: 24 },
      { skuId: items.dishTabs.sku.id, baseQty: 20 },
      { skuId: items.bathTowels.sku.id, baseQty: 4 },
    ],
  });
  await stampReplenishment(julyReplenishment.id, daysAgo(36, 16));

  const weeklyReplenishment = await createReplenishment({
    teamId: ctx.team.id,
    stockLocationId: centralSupply.id,
    propertyId: properties.cedarPeak.id,
    userId: user.id,
    lines: [
      { skuId: items.toiletPaper.sku.id, baseQty: 18 },
      { skuId: items.paperTowels.sku.id, baseQty: 10 },
      { skuId: items.handSoap.sku.id, baseQty: 6 },
      { skuId: items.laundryPods.sku.id, baseQty: 20 },
    ],
  });
  await stampReplenishment(weeklyReplenishment.id, daysAgo(9, 17));

  const weeklyReturn = await createReturn({
    teamId: ctx.team.id,
    reversesLineId: weeklyReplenishment.lines[0].id,
    baseQty: 4,
    stockLocationId: centralSupply.id,
    skuId: items.toiletPaper.sku.id,
    userId: user.id,
  });
  await stampReplenishment(weeklyReturn.id, daysAgo(7, 18));

  const biweeklyReplenishment = await createReplenishment({
    teamId: ctx.team.id,
    stockLocationId: northSupply.id,
    propertyId: properties.riverside.id,
    userId: user.id,
    lines: [
      { skuId: items.paperTowels.sku.id, baseQty: 8 },
      { skuId: items.toiletPaper.sku.id, baseQty: 12 },
      { skuId: items.pillowProtectors.sku.id, baseQty: 6 },
    ],
  });
  await stampReplenishment(biweeklyReplenishment.id, daysAgo(22, 14));

  await createReplenishment({
    teamId: ctx.team.id,
    stockLocationId: linenCage.id,
    propertyId: properties.mapleStreet.id,
    userId: user.id,
    lines: [
      { skuId: items.bathTowels.sku.id, baseQty: 2 },
      { skuId: items.pillowProtectors.sku.id, baseQty: 2 },
    ],
  });

  await createReplenishment({
    teamId: ctx.team.id,
    stockLocationId: centralSupply.id,
    propertyId: properties.mapleStreet.id,
    userId: user.id,
    lines: [
      { skuId: items.coffeePods.sku.id, baseQty: 10 },
      { skuId: items.dishTabs.sku.id, baseQty: 12 },
    ],
  });

  const invoiceResult = await generateDraftInvoicesForTeam(ctx.team.id, {
    asOf: new Date(),
  });

  const summary = await Promise.all([
    prisma.property.count({ where: { teamId: ctx.team.id } }),
    prisma.stockLocation.count({ where: { teamId: ctx.team.id, archivedAt: null } }),
    prisma.supplyItem.count({ where: { teamId: ctx.team.id, archivedAt: null } }),
    prisma.sku.count({ where: { teamId: ctx.team.id, archivedAt: null } }),
    prisma.replenishment.count({ where: { teamId: ctx.team.id } }),
    prisma.invoice.count({ where: { teamId: ctx.team.id } }),
  ]);

  console.log(`Activated ${email}`);
  console.log(`Team: ${ctx.team.name}`);
  console.log(`Created draft invoices: ${invoiceResult.count}`);
  console.log(
    JSON.stringify(
      {
        properties: summary[0],
        stockLocations: summary[1],
        supplyItems: summary[2],
        skus: summary[3],
        replenishments: summary[4],
        invoices: summary[5],
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
