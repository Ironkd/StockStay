import {
  unitOfMeasureOps,
  stockLocationOps,
  supplyItemOps,
  skuOps,
  propertyOps,
  ensureDefaultStockLocation,
} from "../db.js";
import {
  receiveStock,
  adjustStockOnHand,
  locationSupplyThresholdOps,
  stockTransactionOps,
} from "../stockLedger.js";
import { computeUnitRate } from "../decimalUtil.js";
import { mapStockDomainError } from "../middleware/catalogueAuth.js";
import {
  canCreateResource,
  toPlanLimitResponse,
} from "../trialManager.js";

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function registerCatalogueRoutes(app, deps) {
  const {
    authenticateToken,
    requireCatalogueRead,
    requireCatalogueWrite,
    requireInventoryWrite,
    ensureMembershipContext,
  } = deps;

// ==================== CATALOGUE / STOCK LOCATION ROUTES ====================

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

function parseDecimalInput(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return { error: `${fieldName} is required` };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { error: `${fieldName} must be a number` };
  }
  return { value: n };
}

app.get("/api/units-of-measure", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const units = await unitOfMeasureOps.findAll();
    res.json(units);
  } catch (error) {
    console.error("Error fetching units of measure:", error);
    res.status(500).json({ message: "Error fetching units of measure" });
  }
});

app.get("/api/stock-locations", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    if (!includeArchived) {
      await ensureDefaultStockLocation(req.currentUser.teamId);
    }
    const locations = await stockLocationOps.findAllByTeam(req.currentUser.teamId, { includeArchived });
    res.json(locations);
  } catch (error) {
    console.error("Error fetching stock locations:", error);
    res.status(500).json({ message: "Error fetching stock locations" });
  }
});

app.post("/api/stock-locations", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "Stock location name is required." });
    }
    const ctx = await ensureMembershipContext(req.user.id);
    if (!ctx?.organization) {
      return res.status(404).json({ message: "Organization not found." });
    }
    const currentCount = await stockLocationOps.countActiveByTeam(req.currentUser.teamId);
    const check = canCreateResource(ctx.organization, "stockLocations", currentCount);
    if (!check.allowed) {
      return res.status(403).json(toPlanLimitResponse(check));
    }
    const address =
      typeof req.body?.address === "string" ? req.body.address.trim() || null : null;
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const location = await stockLocationOps.create({
      teamId: req.currentUser.teamId,
      name,
      address,
      tags,
    });
    res.status(201).json(location);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A stock location with this name already exists." });
    }
    console.error("Error creating stock location:", error);
    res.status(500).json({ message: "Error creating stock location" });
  }
});

app.get("/api/stock-locations/:id", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const location = await stockLocationOps.findById(req.params.id);
    if (!location || location.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Stock location not found." });
    }
    res.json(location);
  } catch (error) {
    console.error("Error fetching stock location:", error);
    res.status(500).json({ message: "Error fetching stock location" });
  }
});

app.patch("/api/stock-locations/:id", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const existing = await stockLocationOps.findById(req.params.id);
    if (!existing || existing.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Stock location not found." });
    }
    const updates = {};
    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }
    if (req.body?.address !== undefined) {
      updates.address =
        req.body.address == null || req.body.address === ""
          ? null
          : String(req.body.address).trim();
    }
    if (req.body?.tags !== undefined) {
      updates.tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    }
    if (req.body?.archived === true) {
      updates.archivedAt = existing.archivedAt || new Date();
    } else if (req.body?.archived === false) {
      updates.archivedAt = null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid updates provided." });
    }
    const updated = await stockLocationOps.update(existing.id, updates);
    res.json(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A stock location with this name already exists." });
    }
    console.error("Error updating stock location:", error);
    res.status(500).json({ message: "Error updating stock location" });
  }
});

app.post("/api/stock-locations/:id/properties", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const location = await stockLocationOps.findById(req.params.id);
    if (!location || location.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Stock location not found." });
    }
    const propertyId = typeof req.body?.propertyId === "string" ? req.body.propertyId : "";
    if (!propertyId) {
      return res.status(400).json({ message: "propertyId is required." });
    }
    const teamProperties = await propertyOps.findAllByTeam(req.currentUser.teamId);
    const property = teamProperties.find((p) => p.id === propertyId);
    if (!property) {
      return res.status(400).json({ message: "Property must belong to the same team." });
    }
    const link = await stockLocationOps.linkProperty(location.id, propertyId);
    res.status(201).json(link);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "Property is already linked to this stock location." });
    }
    console.error("Error linking property to stock location:", error);
    res.status(500).json({ message: "Error linking property" });
  }
});

app.delete("/api/stock-locations/:id/properties/:propertyId", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const location = await stockLocationOps.findById(req.params.id);
    if (!location || location.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Stock location not found." });
    }
    const teamProperties = await propertyOps.findAllByTeam(req.currentUser.teamId);
    if (!teamProperties.some((p) => p.id === req.params.propertyId)) {
      return res.status(404).json({ message: "Property not found." });
    }
    await stockLocationOps.unlinkProperty(location.id, req.params.propertyId);
    res.json({ message: "Property unlinked" });
  } catch (error) {
    console.error("Error unlinking property from stock location:", error);
    res.status(500).json({ message: "Error unlinking property" });
  }
});

app.get("/api/supply-items", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const items = await supplyItemOps.findAllByTeam(req.currentUser.teamId, { includeArchived });
    res.json(items);
  } catch (error) {
    console.error("Error fetching supply items:", error);
    res.status(500).json({ message: "Error fetching supply items" });
  }
});

app.post("/api/supply-items", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "Supply item name is required." });
    }
    const baseUnitId = typeof req.body?.baseUnitId === "string" ? req.body.baseUnitId : "";
    if (!baseUnitId) {
      return res.status(400).json({ message: "baseUnitId is required." });
    }
    const unit = await unitOfMeasureOps.findById(baseUnitId);
    if (!unit) {
      return res.status(400).json({ message: "Invalid baseUnitId." });
    }
    const ctx = await ensureMembershipContext(req.user.id);
    if (!ctx?.organization) {
      return res.status(404).json({ message: "Organization not found." });
    }
    const currentCount = await supplyItemOps.countActiveByTeam(req.currentUser.teamId);
    const check = canCreateResource(ctx.organization, "supplyItems", currentCount);
    if (!check.allowed) {
      return res.status(403).json(toPlanLimitResponse(check));
    }
    const reorderPoint = parseDecimalInput(req.body?.defaultReorderPoint ?? 0, "defaultReorderPoint");
    if (reorderPoint.error) return res.status(400).json({ message: reorderPoint.error });
    const reorderQty = parseDecimalInput(
      req.body?.defaultReorderQuantity ?? 0,
      "defaultReorderQuantity"
    );
    if (reorderQty.error) return res.status(400).json({ message: reorderQty.error });
    if (reorderPoint.value < 0 || reorderQty.value < 0) {
      return res.status(400).json({ message: "Reorder defaults cannot be negative." });
    }
    const item = await supplyItemOps.create({
      teamId: req.currentUser.teamId,
      name,
      category: typeof req.body?.category === "string" ? req.body.category.trim() : "",
      baseUnitId,
      defaultReorderPoint: reorderPoint.value,
      defaultReorderQuantity: reorderQty.value,
    });
    res.status(201).json(item);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A supply item with this name already exists." });
    }
    console.error("Error creating supply item:", error);
    res.status(500).json({ message: "Error creating supply item" });
  }
});

app.get("/api/supply-items/:id", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const item = await supplyItemOps.findById(req.params.id);
    if (!item || item.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Supply item not found." });
    }
    res.json(item);
  } catch (error) {
    console.error("Error fetching supply item:", error);
    res.status(500).json({ message: "Error fetching supply item" });
  }
});

app.patch("/api/supply-items/:id", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const existing = await supplyItemOps.findById(req.params.id);
    if (!existing || existing.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Supply item not found." });
    }
    const updates = {};
    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }
    if (typeof req.body?.category === "string") {
      updates.category = req.body.category.trim();
    }
    if (typeof req.body?.baseUnitId === "string" && req.body.baseUnitId) {
      const unit = await unitOfMeasureOps.findById(req.body.baseUnitId);
      if (!unit) {
        return res.status(400).json({ message: "Invalid baseUnitId." });
      }
      updates.baseUnitId = req.body.baseUnitId;
    }
    if (req.body?.defaultReorderPoint !== undefined) {
      const parsed = parseDecimalInput(req.body.defaultReorderPoint, "defaultReorderPoint");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (parsed.value < 0) {
        return res.status(400).json({ message: "defaultReorderPoint cannot be negative." });
      }
      updates.defaultReorderPoint = parsed.value;
    }
    if (req.body?.defaultReorderQuantity !== undefined) {
      const parsed = parseDecimalInput(req.body.defaultReorderQuantity, "defaultReorderQuantity");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (parsed.value < 0) {
        return res.status(400).json({ message: "defaultReorderQuantity cannot be negative." });
      }
      updates.defaultReorderQuantity = parsed.value;
    }
    if (req.body?.archived === true) {
      updates.archivedAt = existing.archivedAt || new Date();
    } else if (req.body?.archived === false) {
      updates.archivedAt = null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid updates provided." });
    }
    const updated = await supplyItemOps.update(existing.id, updates);
    res.json(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A supply item with this name already exists." });
    }
    console.error("Error updating supply item:", error);
    res.status(500).json({ message: "Error updating supply item" });
  }
});

app.get("/api/skus", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const supplyItemId =
      typeof req.query.supplyItemId === "string" ? req.query.supplyItemId : undefined;
    const stockLocationId =
      typeof req.query.stockLocationId === "string" ? req.query.stockLocationId : undefined;
    const skus = await skuOps.findAllByTeam(req.currentUser.teamId, {
      includeArchived,
      supplyItemId,
      stockLocationId,
    });
    res.json(skus);
  } catch (error) {
    console.error("Error fetching SKUs:", error);
    res.status(500).json({ message: "Error fetching SKUs" });
  }
});

app.post("/api/skus", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "SKU name is required." });
    }
    const supplyItemId = typeof req.body?.supplyItemId === "string" ? req.body.supplyItemId : "";
    if (!supplyItemId) {
      return res.status(400).json({ message: "supplyItemId is required." });
    }
    const supplyItem = await supplyItemOps.findById(supplyItemId);
    if (!supplyItem || supplyItem.teamId !== req.currentUser.teamId || supplyItem.archivedAt) {
      return res.status(400).json({ message: "Invalid or archived supply item." });
    }
    const ctx = await ensureMembershipContext(req.user.id);
    if (!ctx?.organization) {
      return res.status(404).json({ message: "Organization not found." });
    }
    const skuCount = await skuOps.countActiveByTeam(req.currentUser.teamId);
    const skuCheck = canCreateResource(ctx.organization, "skus", skuCount);
    if (!skuCheck.allowed) {
      return res.status(403).json(toPlanLimitResponse(skuCheck));
    }
    const inventoryCheck = canCreateResource(ctx.organization, "inventoryItems", skuCount);
    if (!inventoryCheck.allowed) {
      return res.status(403).json(toPlanLimitResponse(inventoryCheck));
    }
    const packSize = parseDecimalInput(req.body?.packSize, "packSize");
    if (packSize.error) return res.status(400).json({ message: packSize.error });
    if (!(packSize.value > 0)) {
      return res.status(400).json({ message: "packSize must be greater than zero." });
    }
    const purchasePrice = parseDecimalInput(req.body?.purchasePrice, "purchasePrice");
    if (purchasePrice.error) return res.status(400).json({ message: purchasePrice.error });
    if (purchasePrice.value < 0) {
      return res.status(400).json({ message: "purchasePrice cannot be negative." });
    }
    const unitRate = computeUnitRate(purchasePrice.value, packSize.value).toString();
    const stockLocationId =
      typeof req.body?.stockLocationId === "string" ? req.body.stockLocationId.trim() : "";
    if (stockLocationId) {
      const location = await stockLocationOps.findById(stockLocationId);
      if (!location || location.teamId !== req.currentUser.teamId || location.archivedAt) {
        return res.status(400).json({ message: "Invalid or archived stock location." });
      }
    }
    const sku = await skuOps.create({
      teamId: req.currentUser.teamId,
      supplyItemId,
      name,
      supplier:
        typeof req.body?.supplier === "string" ? req.body.supplier.trim() || null : null,
      packSize: packSize.value,
      purchasePrice: purchasePrice.value,
      unitRate,
    });
    if (stockLocationId) {
      await skuOps.ensureStockOnHand(sku.id, stockLocationId);
      const withSoh = await skuOps.findById(sku.id, { stockLocationId });
      return res.status(201).json(withSoh);
    }
    res.status(201).json(sku);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A SKU with this name already exists." });
    }
    console.error("Error creating SKU:", error);
    res.status(500).json({ message: "Error creating SKU" });
  }
});

app.get("/api/skus/:id", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const sku = await skuOps.findById(req.params.id);
    if (!sku || sku.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "SKU not found." });
    }
    res.json(sku);
  } catch (error) {
    console.error("Error fetching SKU:", error);
    res.status(500).json({ message: "Error fetching SKU" });
  }
});

app.patch("/api/skus/:id", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const existing = await skuOps.findById(req.params.id);
    if (!existing || existing.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "SKU not found." });
    }
    const updates = {};
    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }
    if (req.body?.supplier !== undefined) {
      updates.supplier =
        req.body.supplier == null || req.body.supplier === ""
          ? null
          : String(req.body.supplier).trim();
    }
    let nextPackSize = Number(existing.packSize);
    let nextPurchasePrice = Number(existing.purchasePrice);
    let recomputeRate = false;
    if (req.body?.packSize !== undefined) {
      const parsed = parseDecimalInput(req.body.packSize, "packSize");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (!(parsed.value > 0)) {
        return res.status(400).json({ message: "packSize must be greater than zero." });
      }
      updates.packSize = parsed.value;
      nextPackSize = parsed.value;
      recomputeRate = true;
    }
    if (req.body?.purchasePrice !== undefined) {
      const parsed = parseDecimalInput(req.body.purchasePrice, "purchasePrice");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (parsed.value < 0) {
        return res.status(400).json({ message: "purchasePrice cannot be negative." });
      }
      updates.purchasePrice = parsed.value;
      nextPurchasePrice = parsed.value;
      recomputeRate = true;
    }
    if (recomputeRate) {
      updates.unitRate = computeUnitRate(nextPurchasePrice, nextPackSize).toString();
    }
    if (req.body?.archived === true) {
      updates.archivedAt = existing.archivedAt || new Date();
    } else if (req.body?.archived === false) {
      updates.archivedAt = null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid updates provided." });
    }
    const updated = await skuOps.update(existing.id, updates);
    res.json(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A SKU with this name already exists." });
    }
    console.error("Error updating SKU:", error);
    res.status(500).json({ message: "Error updating SKU" });
  }
});

app.post("/api/skus/:id/stock-locations/:locationId", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const sku = await skuOps.findById(req.params.id);
    if (!sku || sku.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "SKU not found." });
    }
    const location = await stockLocationOps.findById(req.params.locationId);
    if (!location || location.teamId !== req.currentUser.teamId || location.archivedAt) {
      return res.status(400).json({ message: "Invalid or archived stock location." });
    }
    await skuOps.ensureStockOnHand(sku.id, location.id);
    const updated = await skuOps.findById(sku.id, { stockLocationId: location.id });
    res.status(201).json(updated);
  } catch (error) {
    console.error("Error stocking SKU at location:", error);
    res.status(500).json({ message: "Error stocking SKU at location" });
  }
});

app.post("/api/skus/:id/receive", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const stockLocationId =
      typeof req.body?.stockLocationId === "string" ? req.body.stockLocationId.trim() : "";
    if (!stockLocationId) {
      return res.status(400).json({ message: "stockLocationId is required." });
    }
    const qty = parseDecimalInput(req.body?.quantity, "quantity");
    if (qty.error) return res.status(400).json({ message: qty.error });
    if (!(qty.value > 0)) {
      return res.status(400).json({ message: "quantity must be greater than zero." });
    }
    let purchasePrice = req.body?.purchasePrice;
    if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== "") {
      const parsed = parseDecimalInput(purchasePrice, "purchasePrice");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (parsed.value < 0) {
        return res.status(400).json({ message: "purchasePrice cannot be negative." });
      }
      purchasePrice = parsed.value;
    } else {
      purchasePrice = undefined;
    }
    const purchasedAt =
      typeof req.body?.purchasedAt === "string" && req.body.purchasedAt.trim()
        ? req.body.purchasedAt.trim()
        : undefined;
    const result = await receiveStock({
      teamId: req.currentUser.teamId,
      skuId: req.params.id,
      stockLocationId,
      packQty: qty.value,
      purchasePrice,
      purchasedAt,
      userId: req.currentUser.id,
    });
    const sku = await skuOps.findById(req.params.id, { stockLocationId });
    res.status(201).json({ ...result, sku });
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error receiving stock:", error);
    res.status(500).json({ message: "Error receiving stock" });
  }
});

app.post("/api/skus/:id/adjust", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const stockLocationId =
      typeof req.body?.stockLocationId === "string" ? req.body.stockLocationId.trim() : "";
    if (!stockLocationId) {
      return res.status(400).json({ message: "stockLocationId is required." });
    }
    const delta = parseDecimalInput(req.body?.quantityDelta, "quantityDelta");
    if (delta.error) return res.status(400).json({ message: delta.error });
    if (delta.value === 0) {
      return res.status(400).json({ message: "quantityDelta cannot be zero." });
    }
    const result = await adjustStockOnHand({
      teamId: req.currentUser.teamId,
      skuId: req.params.id,
      stockLocationId,
      quantityDelta: delta.value,
      reason: typeof req.body?.reason === "string" ? req.body.reason : null,
      userId: req.currentUser.id,
    });
    const sku = await skuOps.findById(req.params.id, { stockLocationId });
    res.json({ ...result, sku });
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error adjusting stock:", error);
    res.status(500).json({ message: "Error adjusting stock" });
  }
});

app.get(
  "/api/stock-locations/:locationId/supply-thresholds",
  authenticateToken,
  requireCatalogueRead,
  async (req, res) => {
    try {
      const rows = await locationSupplyThresholdOps.listByLocation(
        req.currentUser.teamId,
        req.params.locationId
      );
      if (rows == null) {
        return res.status(404).json({ message: "Stock location not found" });
      }
      res.json(rows);
    } catch (error) {
      if (mapStockDomainError(res, error)) return;
      console.error("Error fetching supply thresholds:", error);
      res.status(500).json({ message: "Error fetching supply thresholds" });
    }
  }
);

app.put(
  "/api/stock-locations/:locationId/supply-thresholds",
  authenticateToken,
  requireInventoryWrite,
  async (req, res) => {
    try {
      const { supplyItemId, reorderPoint, reorderQuantity } = req.body || {};
      if (!supplyItemId) {
        return res.status(400).json({ message: "supplyItemId is required." });
      }
      const row = await locationSupplyThresholdOps.upsert(
        req.currentUser.teamId,
        req.params.locationId,
        supplyItemId,
        { reorderPoint, reorderQuantity }
      );
      res.json(row);
    } catch (error) {
      if (mapStockDomainError(res, error)) return;
      console.error("Error upserting supply threshold:", error);
      res.status(500).json({ message: "Error updating supply threshold" });
    }
  }
);

app.get("/api/location-low-stock", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const rows = await locationSupplyThresholdOps.listLowStock(req.currentUser.teamId);
    res.json(rows);
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error fetching location low stock:", error);
    res.status(500).json({ message: "Error fetching location low stock" });
  }
});

app.get("/api/stock-transactions", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const rows = await stockTransactionOps.findAllByTeam(req.currentUser.teamId, {
      entityType: typeof req.query.entityType === "string" ? req.query.entityType : undefined,
      entityId: typeof req.query.entityId === "string" ? req.query.entityId : undefined,
      skuId: typeof req.query.skuId === "string" ? req.query.skuId : undefined,
      stockLocationId:
        typeof req.query.stockLocationId === "string" ? req.query.stockLocationId : undefined,
      postingId: typeof req.query.postingId === "string" ? req.query.postingId : undefined,
      transactionType:
        typeof req.query.transactionType === "string" ? req.query.transactionType : undefined,
      fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
      toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 200,
    });
    res.json(rows);
  } catch (error) {
    console.error("Error fetching stock transactions:", error);
    res.status(500).json({ message: "Error fetching stock transactions" });
  }
});
}
