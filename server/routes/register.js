/**
 * Mount all API route modules onto the Express app.
 */

import { registerAuthRoutes } from "./auth.js";
import { registerPropertyRoutes } from "./properties.js";
import { registerCatalogueRoutes } from "./catalogue.js";
import { registerReplenishmentRoutes } from "./replenishment.js";
import { registerBillingRoutes } from "./billing.js";
import { registerClientRoutes } from "./clients.js";
import { registerInvoiceRoutes } from "./invoices.js";
import { registerTeamRoutes } from "./team.js";

/**
 * @param {import("express").Express} app
 * @param {object} deps Shared middleware and helpers
 */
export function registerAllRoutes(app, deps) {
  registerAuthRoutes(app, deps);
  registerPropertyRoutes(app, deps);
  registerCatalogueRoutes(app, deps);
  registerReplenishmentRoutes(app, deps);
  registerBillingRoutes(app, deps);
  registerClientRoutes(app, deps);
  registerInvoiceRoutes(app, deps);
  registerTeamRoutes(app, deps);
}
