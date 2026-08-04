import {
  propertyOps,
  organizationOps,
  teamOps,
  clientOps,
  stockLocationOps,
  ensureDefaultStockLocation,
} from "../db.js";
import {
  assertPropertyAccess,
  filterByPropertyAccess,
} from "../middleware/propertyScope.js";
import {
  canCreateProperty,
  getPlanLimits,
  isTrialExpired,
  toPlanLimitResponse,
} from "../trialManager.js";

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function registerPropertyRoutes(app, deps) {
  const {
    authenticateToken,
    loadCurrentUser,
    userHasPageAccess,
  } = deps;


function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

// ==================== PROPERTY ROUTES ====================

// Get current team's properties
app.get("/api/properties", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }
    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    const properties = await propertyOps.findAllByTeam(currentUser.teamId);
    res.json(filterByPropertyAccess(currentUser, properties));
  } catch (error) {
    console.error("Error fetching properties:", error);
    res.status(500).json({ message: "Error fetching properties" });
  }
});

// Create a new property for the current team,
// enforcing plan-based maxProperties limits.
app.post("/api/properties", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    // Only owners can create properties (simple rule for now)
    if (currentUser.teamRole !== "owner") {
      return res
        .status(403)
        .json({ message: "Only team owners can create properties." });
    }

    const team = await teamOps.findById(currentUser.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found." });
    }

    let organization = await organizationOps.findById(team.organizationId);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found." });
    }

    // Check if trial has expired and downgrade if needed
    if (organization.isOnTrial && isTrialExpired(organization)) {
      const freeLimits = getPlanLimits("free");
      await organizationOps.update(organization.id, {
        plan: "free",
        isOnTrial: false,
        trialEndsAt: null,
        trialPlan: null,
        maxProperties: freeLimits.maxProperties ?? 1,
      });
      organization = await organizationOps.findById(organization.id);
      console.log(`[TRIAL] Auto-downgraded organization ${organization.id} from expired trial`);
    }

    // Use trial manager to check property limits (org plan, team property count)
    const currentCount = await propertyOps.countByTeam(team.id);
    const propertyCheck = canCreateProperty(organization, currentCount);

    if (!propertyCheck.canCreate) {
      return res.status(403).json(
        toPlanLimitResponse(
          propertyCheck,
          propertyCheck.plan === "free"
            ? "Free plan property limit reached. Upgrade your plan to add more."
            : undefined
        )
      );
    }

    const { name, location, clientId, markupPercentage, stockLocationIds } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Property name is required." });
    }

    if (clientId) {
      const client = await clientOps.findById(clientId);
      if (!client || client.teamId !== currentUser.teamId) {
        return res.status(400).json({ message: "Billing client not found for this team." });
      }
    }

    const property = await propertyOps.createForTeam(currentUser.teamId, {
      name,
      location,
      clientId: clientId || null,
      markupPercentage:
        markupPercentage === undefined || markupPercentage === "" || markupPercentage === null
          ? null
          : markupPercentage,
    });

    // Link to stock locations (default: ensure Central supply exists and link it)
    let locationIds = Array.isArray(stockLocationIds)
      ? stockLocationIds.filter((id) => typeof id === "string" && id)
      : [];
    if (locationIds.length === 0) {
      const defaultLoc = await ensureDefaultStockLocation(currentUser.teamId);
      if (defaultLoc?.id) locationIds = [defaultLoc.id];
    }
    for (const locId of locationIds) {
      const loc = await stockLocationOps.findById(locId);
      if (!loc || loc.teamId !== currentUser.teamId || loc.archivedAt) {
        continue;
      }
      try {
        await stockLocationOps.linkProperty(locId, property.id);
      } catch (linkErr) {
        // Ignore unique conflicts (already linked)
        if (!isUniqueConstraintError(linkErr)) {
          console.warn("Failed to link property to stock location:", linkErr);
        }
      }
    }

    res.status(201).json(property);
  } catch (error) {
    console.error("Error creating property:", error);
    res.status(500).json({ message: "Error creating property" });
  }
});

app.put("/api/properties/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "You do not belong to a team." });
    }
    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can update properties." });
    }
    const teamProperties = await propertyOps.findAllByTeam(currentUser.teamId);
    const property = teamProperties.find((w) => w.id === req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }
    if (!assertPropertyAccess(res, currentUser, property.id)) return;
    const { name, location, clientId, markupPercentage } = req.body;
    if (clientId) {
      const client = await clientOps.findById(clientId);
      if (!client || client.teamId !== currentUser.teamId) {
        return res.status(400).json({ message: "Billing client not found for this team." });
      }
    }
    const updated = await propertyOps.update(req.params.id, {
      name: typeof name === "string" ? name : property.name,
      location: typeof location === "string" ? location : property.location ?? "",
      ...(clientId !== undefined ? { clientId: clientId || null } : {}),
      ...(markupPercentage !== undefined
        ? {
            markupPercentage:
              markupPercentage === "" || markupPercentage === null ? null : markupPercentage,
          }
        : {}),
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating property:", error);
    res.status(500).json({ message: "Error updating property" });
  }
});

app.delete("/api/properties/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "You do not belong to a team." });
    }
    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can delete properties." });
    }
    const teamProperties = await propertyOps.findAllByTeam(currentUser.teamId);
    const property = teamProperties.find((w) => w.id === req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }
    if (!assertPropertyAccess(res, currentUser, property.id)) return;
    try {
      await propertyOps.delete(req.params.id);
    } catch (err) {
      if (err?.code === "HAS_HISTORY") {
        return res.status(409).json({ message: err.message, code: "HAS_HISTORY" });
      }
      throw err;
    }
    res.json({ message: "Property deleted successfully" });
  } catch (error) {
    console.error("Error deleting property:", error);
    res.status(500).json({ message: "Error deleting property" });
  }
});
}
