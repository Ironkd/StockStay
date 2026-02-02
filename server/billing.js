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
/** Extra user add-on: $5/month per slot (Starter: max 2, Pro: max 3). Create in Stripe as recurring $5/month. */
const stripeExtraUserPriceId = process.env.STRIPE_EXTRA_USER_PRICE_ID;

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

  const subscriptionData = { metadata: { teamId, plan } };
  if (typeof stripeTrialDays === "number" && stripeTrialDays > 0) {
    subscriptionData.trial_period_days = stripeTrialDays;
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
    subscription_data: subscriptionData,
    allow_promotion_codes: true,
  });

  return { url: session.url };
}

/**
 * Create a Stripe Checkout Session for new signup (no team yet). Uses customer_email.
 * After payment, call signup/complete with sessionId to create team and user.
 * @param {Object} opts - { customerEmail, successUrl, cancelUrl, plan, metadata }
 * @param {string} opts.customerEmail
 * @param {string} opts.successUrl - must include {CHECKOUT_SESSION_ID} for Stripe to substitute
 * @param {string} opts.cancelUrl
 * @param {string} [opts.plan] - "starter" | "pro" (default "pro"). Starter bills immediately; Pro gets 14-day trial.
 * @param {Object} [opts.metadata] - optional metadata for the session (plan is added for webhook/signup-complete)
 * @returns {Promise<{ url: string, sessionId: string }>}
 */
export async function createCheckoutSessionForNewSignup(opts) {
  if (!stripe) {
    throw new Error("Stripe billing is not configured. Set STRIPE_SECRET_KEY.");
  }
  const { customerEmail, successUrl, cancelUrl, plan: planParam, metadata = {} } = opts;
  const plan = planParam === "starter" ? "starter" : "pro";
  const priceId = getPriceIdForPlan(plan, "monthly");
  if (!priceId) {
    throw new Error(plan === "starter"
      ? "No Stripe price configured for Starter monthly. Set STRIPE_STARTER_PRICE_ID."
      : "No Stripe price configured for Pro monthly. Set STRIPE_PRO_PRICE_ID.");
  }

  const subscriptionMetadata = { ...metadata, plan };
  const subscriptionData = { metadata: subscriptionMetadata };
  if (plan !== "starter") {
    subscriptionData.trial_period_days = 14;
  }

  const session = await stripe.checkout.sessions.create({
    customer_email: customerEmail,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: subscriptionMetadata,
    subscription_data: subscriptionData,
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
 * Get current extra-user slots from team (for display). Uses DB value (synced by webhook).
 */
export function getExtraUserSlots(team) {
  return Math.max(0, Math.floor(Number(team.extraUserSlots ?? 0)));
}

/**
 * Update the Stripe subscription to set extra user add-on quantity ($5/mo per slot).
 * Caller must ensure team is on Starter or Pro and newQuantity is within plan cap (Starter: 0–2, Pro: 0–3).
 * @param {string} teamId
 * @param {number} newQuantity - Desired number of extra user slots (0 to remove add-on).
 * @returns {Promise<{ extraUserSlots: number }>}
 */
export async function updateExtraUserSlots(teamId, newQuantity) {
  if (!stripe || !stripeExtraUserPriceId) {
    throw new Error("Extra user pricing is not configured. Set STRIPE_EXTRA_USER_PRICE_ID.");
  }
  const team = await teamOps.findById(teamId);
  if (!team?.stripeSubscriptionId) {
    if (team?.isOnTrial) {
      throw new Error("You're on a trial. Extra user slots are available after you subscribe. Use 'Manage subscription' to add a payment method; once your trial converts to a paid subscription, you can add extra users here.");
    }
    throw new Error("No active subscription. Subscribe to Starter or Pro first.");
  }
  const sub = await stripe.subscriptions.retrieve(team.stripeSubscriptionId, {
    expand: ["items.data.price"],
  });
  if (!["active", "trialing"].includes(sub.status)) {
    throw new Error("Subscription is not active.");
  }
  const items = sub.items?.data ?? [];
  const extraItem = items.find((it) => it.price?.id === stripeExtraUserPriceId);
  const otherItems = items.filter((it) => it.price?.id !== stripeExtraUserPriceId);

  const updates = [];
  for (const it of otherItems) {
    updates.push({ id: it.id, quantity: it.quantity });
  }
  if (newQuantity > 0) {
    if (extraItem) {
      updates.push({ id: extraItem.id, quantity: newQuantity });
    } else {
      updates.push({ price: stripeExtraUserPriceId, quantity: newQuantity });
    }
  } else if (extraItem) {
    updates.push({ id: extraItem.id, deleted: true });
  }

  if (updates.length === 0) return { extraUserSlots: 0 };
  await stripe.subscriptions.update(team.stripeSubscriptionId, { items: updates });
  await teamOps.update(teamId, { extraUserSlots: newQuantity });
  return { extraUserSlots: newQuantity };
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
      const items = subscription.items?.data ?? [];
      const planItem = items.find((item) => item.price?.id && item.price.id !== stripeExtraUserPriceId);
      const interval = planItem?.price?.recurring?.interval ?? null;
      const billingInterval = interval === "year" || interval === "month" ? interval : null;
      let extraUserSlots = 0;
      if (stripeExtraUserPriceId) {
        const extraItem = items.find((item) => item.price?.id === stripeExtraUserPriceId);
        if (extraItem?.quantity) extraUserSlots = Math.max(0, Math.floor(Number(extraItem.quantity)));
      }
      await teamOps.update(teamId, {
        plan: isActive ? plan : "free",
        maxProperties: isActive ? limits.maxProperties : 1,
        extraUserSlots: isActive ? extraUserSlots : 0,
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: status,
        billingInterval: isActive ? billingInterval : null,
        isOnTrial: false,
        trialEndsAt: null,
        trialPlan: null,
      });
      console.log(`[BILLING] Subscription ${subscription.id} for team ${teamId}: ${plan} ${status}, extraUserSlots=${extraUserSlots}`);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const teamId = subscription.metadata?.teamId;
      if (!teamId) break;
      await teamOps.update(teamId, {
        plan: "free",
        maxProperties: 1,
        extraUserSlots: 0,
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
