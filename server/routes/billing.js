import {
  organizationOps,
} from "../db.js";
import {
  createCheckoutSession,
  createCustomerPortalSession,
  ensureOrgStripeCustomer,
  isBillingConfigured,
  updateExtraUserSlots,
} from "../billing.js";
import { getEffectivePlan, getPlanLimits } from "../trialManager.js";

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function registerBillingRoutes(app, deps) {
  const {
    authenticateToken,
    loadCurrentUser,
  } = deps;

// ==================== BILLING (STRIPE) ROUTES ====================

const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";

app.post("/api/billing/create-checkout-session", authenticateToken, async (req, res) => {
  try {
    if (!isBillingConfigured()) {
      return res.status(503).json({ message: "Billing is not configured. Contact support." });
    }
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.organizationId) {
      return res.status(400).json({ message: "You must belong to an organization to upgrade." });
    }
    if (!currentUser.isOrgOwner) {
      return res.status(403).json({ message: "Only the organization owner can manage billing." });
    }
    const base = (APP_URL || "").replace(/\/$/, "");
    const successUrl = req.body.successUrl || `${base}/dashboard?checkout=success`;
    const cancelUrl = req.body.cancelUrl || `${base}/pricing?checkout=cancelled`;
    const plan = req.body.plan === "starter" ? "starter" : "pro";
    const billingPeriod = req.body.billingPeriod === "annual" ? "annual" : "monthly";
    const stripeTrialDays = typeof req.body.stripeTrialDays === "number" ? req.body.stripeTrialDays : 14;
    const { url } = await createCheckoutSession({
      organizationId: currentUser.organizationId,
      customerEmail: currentUser.email,
      successUrl,
      cancelUrl,
      plan,
      billingPeriod,
      stripeTrialDays,
    });
    res.json({ url });
  } catch (error) {
    console.error("Create checkout session error:", error);
    res.status(500).json({ message: "Failed to create checkout session." });
  }
});

app.post("/api/billing/customer-portal", authenticateToken, async (req, res) => {
  try {
    if (!isBillingConfigured()) {
      return res.status(503).json({ message: "Billing is not configured. Contact support." });
    }
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.organizationId) {
      return res.status(400).json({ message: "You must belong to an organization." });
    }
    if (!currentUser.isOrgOwner) {
      return res.status(403).json({ message: "Only the organization owner can manage billing." });
    }
    const customerId = await ensureOrgStripeCustomer(currentUser.organizationId, currentUser.email);
    const base = (APP_URL || "").replace(/\/$/, "");
    const returnUrl = req.body.returnUrl || `${base}/settings`;
    const { url } = await createCustomerPortalSession({
      customerId,
      returnUrl,
    });
    res.json({ url });
  } catch (error) {
    console.error("Customer portal error:", error);
    res.status(500).json({ message: "Failed to open billing portal." });
  }
});

/** Set extra user slots (Starter: 0–2, Pro: 0–3). $5/mo per slot. Requires STRIPE_EXTRA_USER_PRICE_ID. */
app.patch("/api/billing/extra-user", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.organizationId) {
      return res.status(400).json({ message: "You must belong to an organization." });
    }
    if (!currentUser.isOrgOwner) {
      return res.status(403).json({ message: "Only the organization owner can manage extra user slots." });
    }
    const org = await organizationOps.findById(currentUser.organizationId);
    if (!org) return res.status(404).json({ message: "Organization not found." });
    const effectivePlan = getEffectivePlan(org);
    const limits = getPlanLimits(effectivePlan);
    if (limits.baseMaxUsers == null) {
      return res.status(400).json({ message: "Extra user slots are only for Starter and Pro plans." });
    }
    const maxExtra = limits.maxExtraUserSlots ?? 0;
    const quantity = typeof req.body.quantity === "number" ? Math.max(0, Math.min(maxExtra, Math.floor(req.body.quantity))) : (org.extraUserSlots ?? 0);
    const result = await updateExtraUserSlots(currentUser.organizationId, quantity);
    res.json(result);
  } catch (error) {
    console.error("Extra user slots error:", error);
    res.status(500).json({ message: "Failed to update extra user slots." });
  }
});
}
