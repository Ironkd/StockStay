import {
  createReplenishment,
  createReturn,
  createInterPropertyTransfer,
  getReplenishment,
  getReturnableQty,
  listReplenishments,
  listUnbilledLines,
  listUnrevertedLinesForPropertySupply,
} from "../replenishment.js";
import { prisma } from "../db.js";
import { mapStockDomainError } from "../middleware/catalogueAuth.js";
import { assertPropertyAccess, filterByPropertyAccess } from "../middleware/propertyScope.js";

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function registerReplenishmentRoutes(app, deps) {
  const {
    authenticateToken,
    requireInventoryRead,
    requireInventoryWrite,
    loadCurrentUser,
    userHasPageAccess,
  } = deps;


app.post("/api/replenishments", authenticateToken, requireInventoryWrite, async (req, res) => {
  try {
    const { stockLocationId, propertyId, lines } = req.body || {};
    if (!stockLocationId || !propertyId) {
      return res.status(400).json({ message: "stockLocationId and propertyId are required." });
    }
    if (!assertPropertyAccess(res, req.currentUser, propertyId)) return;
    const result = await createReplenishment({
      teamId: req.currentUser.teamId,
      stockLocationId,
      propertyId,
      lines: Array.isArray(lines) ? lines : [],
      userId: req.currentUser.id,
    });
    res.status(201).json(result);
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error creating replenishment:", error);
    res.status(500).json({ message: "Error creating replenishment" });
  }
});

app.get("/api/replenishments", authenticateToken, requireInventoryRead, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const transferGroupId =
      typeof req.query.transferGroupId === "string" ? req.query.transferGroupId : undefined;
    const propertyId =
      typeof req.query.propertyId === "string" ? req.query.propertyId : undefined;
    const rows = await listReplenishments(req.currentUser.teamId, {
      limit,
      transferGroupId,
      propertyId,
    });
    res.json(
      filterByPropertyAccess(req.currentUser, rows, (row) => row.propertyId ?? row.property?.id)
    );
  } catch (error) {
    console.error("Error listing replenishments:", error);
    res.status(500).json({ message: "Error listing replenishments" });
  }
});

app.post("/api/replenishments/transfers", authenticateToken, requireInventoryWrite, async (req, res) => {
  try {
    const { fromPropertyId, toPropertyId, stockLocationId, skuId, baseQty } = req.body || {};
    if (!fromPropertyId || !toPropertyId || !stockLocationId || !skuId || baseQty == null) {
      return res.status(400).json({
        message: "fromPropertyId, toPropertyId, stockLocationId, skuId, and baseQty are required.",
      });
    }
    if (!assertPropertyAccess(res, req.currentUser, fromPropertyId, "You do not have access to the source property.")) {
      return;
    }
    if (!assertPropertyAccess(res, req.currentUser, toPropertyId, "You do not have access to the destination property.")) {
      return;
    }
    const result = await createInterPropertyTransfer({
      teamId: req.currentUser.teamId,
      fromPropertyId,
      toPropertyId,
      stockLocationId,
      skuId,
      baseQty,
      userId: req.currentUser.id,
    });
    res.status(201).json(result);
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error creating inter-property transfer:", error);
    res.status(500).json({
      message: "Error creating transfer",
      transferGroupId: error.transferGroupId || error.details?.transferGroupId,
      details: error.details,
    });
  }
});

app.post("/api/replenishments/returns", authenticateToken, requireInventoryWrite, async (req, res) => {
  try {
    const { reversesLineId, baseQty, stockLocationId, skuId } = req.body || {};
    if (!reversesLineId || baseQty == null) {
      return res.status(400).json({ message: "reversesLineId and baseQty are required." });
    }
    const originalLine = await prisma.replenishmentLine.findFirst({
      where: { id: reversesLineId },
      include: { replenishment: { select: { teamId: true, propertyId: true } } },
    });
    if (!originalLine || originalLine.replenishment.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Line not found." });
    }
    if (!assertPropertyAccess(res, req.currentUser, originalLine.replenishment.propertyId)) return;
    const result = await createReturn({
      teamId: req.currentUser.teamId,
      reversesLineId,
      baseQty,
      stockLocationId: stockLocationId || undefined,
      skuId: skuId || undefined,
      userId: req.currentUser.id,
    });
    res.status(201).json(result);
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error creating return:", error);
    res.status(500).json({ message: "Error creating return" });
  }
});

app.get(
  "/api/replenishments/unreverted",
  authenticateToken,
  requireInventoryRead,
  async (req, res) => {
    try {
      const propertyId = typeof req.query.propertyId === "string" ? req.query.propertyId : "";
      const supplyItemId =
        typeof req.query.supplyItemId === "string" ? req.query.supplyItemId : "";
      if (!propertyId || !supplyItemId) {
        return res
          .status(400)
          .json({ message: "propertyId and supplyItemId query params are required." });
      }
      if (!assertPropertyAccess(res, req.currentUser, propertyId)) return;
      const result = await listUnrevertedLinesForPropertySupply(
        req.currentUser.teamId,
        propertyId,
        supplyItemId
      );
      res.json(result);
    } catch (error) {
      if (mapStockDomainError(res, error)) return;
      console.error("Error listing unreverted lines:", error);
      res.status(500).json({ message: "Error listing unreverted lines" });
    }
  }
);

app.get("/api/replenishments/lines/:id/returnable", authenticateToken, requireInventoryRead, async (req, res) => {
  try {
    const line = await prisma.replenishmentLine.findFirst({
      where: { id: req.params.id },
      include: { replenishment: { select: { teamId: true, propertyId: true } } },
    });
    if (!line || line.replenishment.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Line not found." });
    }
    if (!assertPropertyAccess(res, req.currentUser, line.replenishment.propertyId)) return;
    const row = await getReturnableQty(req.currentUser.teamId, req.params.id);
    if (!row) return res.status(404).json({ message: "Line not found." });
    res.json(row);
  } catch (error) {
    console.error("Error fetching returnable qty:", error);
    res.status(500).json({ message: "Error fetching returnable qty" });
  }
});

app.get("/api/replenishments/:id", authenticateToken, requireInventoryRead, async (req, res) => {
  try {
    const row = await getReplenishment(req.currentUser.teamId, req.params.id);
    if (!row) return res.status(404).json({ message: "Replenishment not found." });
    if (!assertPropertyAccess(res, req.currentUser, row.propertyId ?? row.property?.id)) return;
    res.json(row);
  } catch (error) {
    console.error("Error fetching replenishment:", error);
    res.status(500).json({ message: "Error fetching replenishment" });
  }
});

app.get("/api/unbilled-lines", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }
    const canAccess =
      userHasPageAccess(currentUser, "invoices") || userHasPageAccess(currentUser, "inventory");
    if (!canAccess) {
      return res.status(403).json({ message: "You do not have access to unbilled lines." });
    }
    const rows = await listUnbilledLines(currentUser.teamId);
    res.json(filterByPropertyAccess(currentUser, rows, (row) => row.property?.id));
  } catch (error) {
    console.error("Error listing unbilled lines:", error);
    res.status(500).json({ message: "Error listing unbilled lines" });
  }
});
}
