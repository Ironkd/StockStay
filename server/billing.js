/**
 * Stripe billing module
 * - Create Checkout Session for Pro subscription
 * - Handle webhooks to sync subscription status to Team
 */

import Stripe from "stripe";
import { teamOps } from "./db.js";
import { getPlanLimits } from "./trialManager.js";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
// Price IDs: one per plan × billing period (optional – only Pro is required for "Upgrade to Pro")
const stripeProPriceId = process.env.STRIPE_PRO_PRICE_ID;
const stripeProAnnualPriceId = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
const stripeStarterPriceId = process.env.STRIPE_STARTER_PRICE_ID;
const stripeStarterAnnualPriceId = process.env.STRIPE_STARTER_ANNUAL_PRICE_ID;

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export function isBillingConfigured() {
  return Boolean(stripeSecretKey && stripeProPriceId);
}

/** Resolve Stripe Price ID for plan + billing period. Falls back to monthly Pro if unknown. */
function getPriceIdForPlan(plan, billingPeriod) {
  const isAnnual = billingPeriod === "annual";
  if (plan === "pro") {
    return isAnnual && stripeProAnnualPriceId ? stripeProAnnualPriceId : stripeProPriceId;
  }
  if (plan === "starter") {
    if (isAnnual && stripeStarterAnnualPriceId) return stripeStarterAnnualPriceId;
    if (stripeStarterPriceId) return stripeStarterPriceId;
  }
  return stripeProPriceId;
}

/**
 * Create a Stripe Checkout Session for a paid plan (Pro or Starter).
 * @param {Object} opts - { teamId, customerEmail, successUrl, cancelUrl, plan, billingPeriod, stripeTrialDays }
 * @param {string} [opts.plan] - "pro" | "starter" (default "pro")
 * @param {string} [opts.billingPeriod] - "monthly" | "annual" (default "monthly")
 * @param {number} [opts.stripeTrialDays] - Days free then Stripe auto-charges (default 14). Set 0 to charge immediately.
 * @returns {Promise<{ url: string }>} Checkout URL
 */
export async function createCheckoutSession(opts) {
  if (!stripe || !stripeProPriceId) {
    throw new Error("Stripe billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRO_PRICE_ID.");
  }
  const {
    teamId,
    customerEmail,
    successUrl,
    cancelUrl,
    plan = "pro",
    billingPeriod = "monthly",
    stripeTrialDays = 14,
  } = opts;
  const team = await teamOps.findById(teamId);
  if (!team) throw new Error("Team not found");

  const priceId = getPriceIdForPlan(plan, billingPeriod);
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan "${plan}" and billing "${billingPeriod}".`);
  }

  let customerId = team.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      metadata: { teamId },
    });
    customerId = customer.id;
    await teamOps.update(teamId, { stripeCustomerId: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { teamId, plan },
    subscription_data: {
      metadata: { teamId, plan },
      trial_period_days: typeof stripeTrialDays === "number" && stripeTrialDays > 0 ? stripeTrialDays : 0,
    },
    allow_promotion_codes: true,
  });

  return { url: session.url };
}

/**
 * Create a Stripe Checkout Session for new signup (no team yet). Uses customer_email.
 * After payment, call signup/complete with sessionId to create team and user.
 * @param {Object} opts - { customerEmail, successUrl, cancelUrl, metadata }
 * @param {string} opts.customerEmail
 * @param {string} opts.successUrl - must include {CHECKOUT_SESSION_ID} for Stripe to substitute
 * @param {string} opts.cancelUrl
 * @param {Object} [opts.metadata] - optional metadata for the session
 * @returns {Promise<{ url: string, sessionId: string }>}
 */
export async function createCheckoutSessionForNewSignup(opts) {
  if (!stripe || !stripeProPriceId) {
    throw new Error("Stripe billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRO_PRICE_ID.");
  }
  const { customerEmail, successUrl, cancelUrl, metadata = {} } = opts;
  const priceId = getPriceIdForPlan("pro", "monthly");
  if (!priceId) throw new Error("No Stripe price configured for Pro monthly.");

  const session = await stripe.checkout.sessions.create({
    customer_email: customerEmail,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { ...metadata },
    subscription_data: {
      metadata: { ...metadata },
      trial_period_days: 14,
    },
    allow_promotion_codes: true,
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Ensure team has a Stripe customer (create if missing). Returns customer ID.
 * @param {string} teamId
 * @param {string} customerEmail
 * @returns {Promise<string>} Stripe customer ID
 */
export async function ensureTeamStripeCustomer(teamId, customerEmail) {
  if (!stripe) {
    throw new Error("Stripe billing is not configured. Set STRIPE_SECRET_KEY.");
  }
  const team = await teamOps.findById(teamId);
  if (team?.stripeCustomerId) return team.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: customerEmail,
    metadata: { teamId },
  });
  await teamOps.update(teamId, { stripeCustomerId: customer.id });
  return customer.id;
}

/**
 * Create a Stripe Customer Portal session for managing subscription (cancel, update payment).
 * @param {Object} opts - { customerId, returnUrl }
 * @returns {Promise<{ url: string }>} Portal URL
 */
export async function createCustomerPortalSession(opts) {
  if (!stripe) {
    throw new Error("Stripe billing is not configured. Set STRIPE_SECRET_KEY.");
  }
  const { customerId, returnUrl } = opts;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

/**
 * Handle Stripe webhook event. Sync subscription status to Team.
 * @param {Buffer} rawBody - Raw request body (required for signature verification)
 * @param {string} signature - Stripe-Signature header
 * @returns {Promise<{ received: boolean }>}
 */
export async function handleWebhook(rawBody, signature) {
  if (!stripe || !stripeWebhookSecret) {
    throw new Error("Stripe webhook is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.");
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const teamId = subscription.metadata?.teamId;
      if (!teamId) break;
      const status = subscription.status;
      const isActive = ["active", "trialing"].includes(status);
      const plan = subscription.metadata?.plan === "starter" ? "starter" : "pro";
      const limits = getPlanLimits(plan);
      const interval = subscription.items?.data?.[0]?.price?.recurring?.interval ?? null;
      const billingInterval = interval === "year" || interval === "month" ? interval : null;
      await teamOps.update(teamId, {
        plan: isActive ? plan : "free",
        maxProperties: isActive ? limits.maxProperties : 1,
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: status,
        billingInterval: isActive ? billingInterval : null,
        isOnTrial: false,
        trialEndsAt: null,
        trialPlan: null,
      });
      console.log(`[BILLING] Subscription ${subscription.id} for team ${teamId}: ${plan} ${status}`);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const teamId = subscription.metadata?.teamId;
      if (!teamId) break;
      await teamOps.update(teamId, {
        plan: "free",
        maxProperties: 1,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: "canceled",
        billingInterval: null,
      });
      console.log(`[BILLING] Subscription canceled for team ${teamId}`);
      break;
    }
    default:
      // Unhandled event type
      break;
  }

  return { received: true };
}
