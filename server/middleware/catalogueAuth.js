/**
 * Catalogue / inventory auth middleware and unified stock domain error mapping.
 * Attach req.currentUser after authenticateToken.
 */

import {
  InsufficientStockError,
  LedgerValidationError,
} from "../stockLedger.js";

export function userCanAccessCatalogue(user, userHasPageAccess) {
  return (
    userHasPageAccess(user, "inventory") ||
    userHasPageAccess(user, "shopping-list") ||
    userHasPageAccess(user, "settings")
  );
}

export function userCanWriteCatalogue(user, userHasPageAccess) {
  if (!userCanAccessCatalogue(user, userHasPageAccess)) return false;
  if (user.teamRole === "viewer") return false;
  return true;
}

/**
 * @param {{ loadCurrentUser: Function, userHasPageAccess: Function }} deps
 */
export function createCatalogueAuth({ loadCurrentUser, userHasPageAccess }) {
  async function attachUser(req, res) {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.teamId) {
      res.status(400).json({ message: "User does not belong to a team." });
      return null;
    }
    req.currentUser = currentUser;
    return currentUser;
  }

  async function requireCatalogueRead(req, res, next) {
    try {
      const user = await attachUser(req, res);
      if (!user) return;
      if (!userCanAccessCatalogue(user, userHasPageAccess)) {
        return res.status(403).json({ message: "You do not have access to catalogue data." });
      }
      next();
    } catch (err) {
      next(err);
    }
  }

  async function requireCatalogueWrite(req, res, next) {
    try {
      const user = await attachUser(req, res);
      if (!user) return;
      if (!userCanWriteCatalogue(user, userHasPageAccess)) {
        const isViewer = user.teamRole === "viewer";
        return res.status(403).json({
          code: isViewer ? "VIEWER_READ_ONLY" : undefined,
          message: isViewer
            ? "Viewers have read-only access and cannot make changes."
            : "You do not have permission to modify catalogue data.",
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  }

  async function requireInventoryRead(req, res, next) {
    try {
      const user = await attachUser(req, res);
      if (!user) return;
      if (!userHasPageAccess(user, "inventory")) {
        return res.status(403).json({ message: "You do not have access to Inventory." });
      }
      next();
    } catch (err) {
      next(err);
    }
  }

  async function requireInventoryWrite(req, res, next) {
    try {
      const user = await attachUser(req, res);
      if (!user) return;
      if (!userHasPageAccess(user, "inventory")) {
        return res.status(403).json({ message: "You do not have access to Inventory." });
      }
      if (!userCanWriteCatalogue(user, userHasPageAccess)) {
        return res.status(403).json({
          code: "VIEWER_READ_ONLY",
          message: "Viewers have read-only access and cannot make changes.",
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  }

  return {
    requireCatalogueRead,
    requireCatalogueWrite,
    requireInventoryRead,
    requireInventoryWrite,
  };
}

/**
 * Map ledger / replenishment domain errors to HTTP responses.
 * @returns {boolean} true if response was sent
 */
export function mapStockDomainError(res, error) {
  if (error instanceof InsufficientStockError) {
    res.status(409).json({
      message: error.message,
      code: error.code,
      details: error.details,
      transferGroupId: error.transferGroupId || error.details?.transferGroupId,
    });
    return true;
  }
  if (error instanceof LedgerValidationError) {
    res.status(400).json({
      message: error.message,
      code: error.code,
      details: error.details,
    });
    return true;
  }
  // Duck-type to avoid circular imports with replenishment.js
  if (error?.name === "ReplenishmentError") {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "INSUFFICIENT"
          ? 409
          : 400;
    res.status(status).json({
      message: error.message,
      code: error.code,
      details: error.details,
      transferGroupId: error.transferGroupId || error.details?.transferGroupId,
    });
    return true;
  }
  return false;
}
