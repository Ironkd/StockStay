/**
 * Stripe billing module
 * - Create Checkout Session for Pro subscription
 * - Handle webhooks to sync subscription status to Organization
 */

import Stripe from "stripe";
import { organizationOps, prisma, teamOps } from "./db.js";
import { getPlanLimits } from "./trialManager.js";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripeProPriceId = process.env.STRIPE_PRO_PRICE_ID;
const stripeProAnnualPriceId = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
const stripeStarterPriceId = process.env.STRIPE_STARTER_PRICE_ID;
const stripeStarterAnnualPriceId = process.env.STRIPE_STARTER_ANNUAL_PRICE_ID;
const stripeExtraUserPriceId = process.env.STRIPE_EXTRA_USER_PRICE_ID;

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export function isBillingConfigured() {
  return Boolean(stripeSecretKey && stripeProPriceId);
}

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
 * Resolve organization id from Stripe metadata (organizationId preferred; legacy teamId supported).
 */
async function resolveOrganizationIdFromMetadata(metadata) {
  if (metadata?.organizationId) return metadata.organizationId;
  if (metadata?.teamId) {
    const team = await teamOps.findById(metadata.teamId);
    return team?.organizationId ?? null;
  }
  return null;
}

function getStripeCustomerId(customer) {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id ?? null;
}

async function claimWebhookEvent(eventId) {
  try {
    await prisma.processedWebhookEvent.create({
      data: { stripeEventId: eventId },
    });
    return true;
  } catch (err) {
    if (err?.code === "P2002") return false;
    throw err;
  }
}

async function releaseWebhookEvent(eventId) {
  await prisma.processedWebhookEvent.deleteMany({
    where: { stripeEventId: eventId },
  });
}

async function resolveVerifiedOrganizationForSubscription(subscription, eventType) {
  const organizationId = await resolveOrganizationIdFromMetadata(subscription.metadata);
  if (!organizationId) return null;

  const org = await organizationOps.findById(organizationId);
  if (!org) {
    console.warn(`[BILLING] Ignoring ${eventType}: organization ${organizationId} not found`);
    return null;
  }

  const eventCustomerId = getStripeCustomerId(subscription.customer);
  const eventSubscriptionId = subscription.id ?? null;
  const hasStoredStripeLink = Boolean(org.stripeCustomerId || org.stripeSubscriptionId);

  if (!hasStoredStripeLink) {
    console.log(
      `[BILLING] First Stripe linkage for org ${organizationId} via ${eventType}: customer=${eventCustomerId ?? "unknown"} subscription=${eventSubscriptionId ?? "unknown"}`
    );
    return { organizationId, org, eventCustomerId, eventSubscriptionId };
  }

  const customerMismatch = org.stripeCustomerId && org.stripeCustomerId !== eventCustomerId;
  const subscriptionMismatch =
    org.stripeSubscriptionId && org.stripeSubscriptionId !== eventSubscriptionId;

  // A customer id mismatch is always rejected - the event genuinely refers to a different
  // Stripe customer than the one linked to this org. A subscription-id-only mismatch on a
  // created/updated event is treated as "the customer's subscription was replaced" (e.g.
  // cancel-then-resubscribe, or a plan change that creates a new subscription object) and is
  // allowed through so the org adopts the new subscription id. Stripe does not guarantee
  // webhook delivery order, so rejecting this outright could permanently strand the org on a
  // stale subscription id with no reconciliation path. `deleted` events still require an
  // exact subscription-id match so a stale cancellation for an already-replaced subscription
  // can't cancel the org's current, newer subscription.
  const allowSubscriptionReplacement =
    subscriptionMismatch && !customerMismatch && eventType !== "customer.subscription.deleted";

  if (customerMismatch || (subscriptionMismatch && !allowSubscriptionReplacement)) {
    console.warn(
      `[BILLING] Ignoring ${eventType} for org ${organizationId}: Stripe identity mismatch (stored customer=${org.stripeCustomerId ?? "none"}, event customer=${eventCustomerId ?? "none"}, stored subscription=${org.stripeSubscriptionId ?? "none"}, event subscription=${eventSubscriptionId ?? "none"})`
    );
    return null;
  }

  if (allowSubscriptionReplacement) {
    console.log(
      `[BILLING] ${eventType} for org ${organizationId} references a new subscription id (stored=${org.stripeSubscriptionId}, event=${eventSubscriptionId}); adopting it as the customer id matches.`
    );
  }

  return { organizationId, org, eventCustomerId, eventSubscriptionId };
}

/**
 * @param {Object} opts - { organizationId, customerEmail, successUrl, cancelUrl, plan, billingPeriod, stripeTrialDays }
 */
export async function createCheckoutSession(opts) {
  if (!stripe || !stripeProPriceId) {
    throw new Error("Stripe billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRO_PRICE_ID.");
  }
  const {
    organizationId,
    teamId: legacyTeamId,
    customerEmail,
    successUrl,
    cancelUrl,
    plan = "pro",
    billingPeriod = "monthly",
    stripeTrialDays = 14,
  } = opts;

  let orgId = organizationId;
  if (!orgId && legacyTeamId) {
    const team = await teamOps.findById(legacyTeamId);
    orgId = team?.organizationId;
  }
  const org = await organizationOps.findById(orgId);
  if (!org) throw new Error("Organization not found");

  const priceId = getPriceIdForPlan(plan, billingPeriod);
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan "${plan}" and billing "${billingPeriod}".`);
  }

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      metadata: { organizationId: org.id },
    });
    customerId = customer.id;
    await organizationOps.update(org.id, { stripeCustomerId: customerId });
  }

  const subscriptionData = { metadata: { organizationId: org.id, plan } };
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
    metadata: { organizationId: org.id, plan },
    subscription_data: subscriptionData,
    allow_promotion_codes: true,
  });

  return { url: session.url };
}

/**
 * Ensure organization has a Stripe customer. Returns customer ID.
 */
export async function ensureOrgStripeCustomer(organizationId, customerEmail) {
  if (!stripe) {
    throw new Error("Stripe billing is not configured. Set STRIPE_SECRET_KEY.");
  }
  const org = await organizationOps.findById(organizationId);
  if (org?.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: customerEmail,
    metadata: { organizationId },
  });
  await organizationOps.update(organizationId, { stripeCustomerId: customer.id });
  return customer.id;
}

/** @deprecated use ensureOrgStripeCustomer */
export async function ensureTeamStripeCustomer(teamId, customerEmail) {
  const team = await teamOps.findById(teamId);
  if (!team?.organizationId) throw new Error("Team not found");
  return ensureOrgStripeCustomer(team.organizationId, customerEmail);
}

export function getExtraUserSlots(org) {
  return Math.max(0, Math.floor(Number(org.extraUserSlots ?? 0)));
}

/**
 * Update extra user add-on quantity on the organization subscription.
 */
export async function updateExtraUserSlots(organizationId, newQuantity) {
  if (!stripe || !stripeExtraUserPriceId) {
    throw new Error("Extra user pricing is not configured. Set STRIPE_EXTRA_USER_PRICE_ID.");
  }
  const org = await organizationOps.findById(organizationId);
  if (!org?.stripeSubscriptionId) {
    if (org?.isOnTrial) {
      throw new Error("You're on a trial. Extra user slots are available after you subscribe. Use 'Manage subscription' to add a payment method; once your trial converts to a paid subscription, you can add extra users here.");
    }
    throw new Error("No active subscription. Subscribe to Starter or Pro first.");
  }
  const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId, {
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
  await stripe.subscriptions.update(org.stripeSubscriptionId, { items: updates });
  await organizationOps.update(organizationId, { extraUserSlots: newQuantity });
  return { extraUserSlots: newQuantity };
}

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
 * Handle Stripe webhook event. Sync subscription status to Organization.
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

  if (!event.id) {
    throw new Error("Webhook event is missing an id.");
  }

  const claimed = await claimWebhookEvent(event.id);
  if (!claimed) {
    console.log(`[BILLING] Ignoring duplicate Stripe webhook event ${event.id}`);
    return { received: true, duplicate: true };
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const resolved = await resolveVerifiedOrganizationForSubscription(subscription, event.type);
        if (!resolved) break;

        const { organizationId, eventCustomerId } = resolved;
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
        await organizationOps.update(organizationId, {
          plan: isActive ? plan : "free",
          maxProperties: isActive ? limits.maxProperties : 1,
          extraUserSlots: isActive ? extraUserSlots : 0,
          stripeCustomerId: eventCustomerId || undefined,
          stripeSubscriptionId: subscription.id,
          stripeSubscriptionStatus: status,
          billingInterval: isActive ? billingInterval : null,
          isOnTrial: false,
          trialEndsAt: null,
          trialPlan: null,
        });
        console.log(`[BILLING] Subscription ${subscription.id} for org ${organizationId}: ${plan} ${status}, extraUserSlots=${extraUserSlots}`);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const resolved = await resolveVerifiedOrganizationForSubscription(subscription, event.type);
        if (!resolved) break;

        const { organizationId } = resolved;
        await organizationOps.update(organizationId, {
          plan: "free",
          maxProperties: 1,
          extraUserSlots: 0,
          stripeSubscriptionId: null,
          stripeSubscriptionStatus: "canceled",
          billingInterval: null,
        });
        console.log(`[BILLING] Subscription canceled for org ${organizationId}`);
        break;
      }
      default:
        break;
    }

    return { received: true };
  } catch (err) {
    await releaseWebhookEvent(event.id);
    throw err;
  }
}
