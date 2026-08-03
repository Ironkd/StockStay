/**
 * Trial Management Module
 * Handles free trial logic for Pro plan (14 days) at Organization level
 */

import { prisma } from "./db.js";
import {
  getPlanLimits,
  getResourceMax,
  isWithinLimit,
  planLimitErrorBody,
} from "./planConfig.js";

export { getPlanLimits, getAllPlans, planLimitErrorBody } from "./planConfig.js";

/**
 * Start a 14-day Pro trial for an organization
 * @param {string} organizationId
 * @returns {Promise<Object>} Updated organization
 */
export async function startProTrial(organizationId) {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);
  const limits = getPlanLimits("pro");

  return await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan: "pro",
      isOnTrial: true,
      trialEndsAt: trialEndsAt,
      trialPlan: "pro",
      maxProperties: limits.maxProperties,
    },
  });
}

/**
 * Start a 14-day Starter trial for an organization
 * @param {string} organizationId
 * @returns {Promise<Object>} Updated organization
 */
export async function startStarterTrial(organizationId) {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);
  const limits = getPlanLimits("starter");

  return await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan: "starter",
      isOnTrial: true,
      trialEndsAt: trialEndsAt,
      trialPlan: "starter",
      maxProperties: limits.maxProperties,
    },
  });
}

/**
 * @param {Object} org - Organization with trial fields
 */
export function isTrialExpired(org) {
  if (!org?.isOnTrial || !org.trialEndsAt) {
    return false;
  }
  return new Date() > new Date(org.trialEndsAt);
}

/**
 * @param {Object} org - Organization
 */
export function getEffectivePlan(org) {
  if (!org) return "free";

  if (org.isOnTrial && org.trialPlan && !isTrialExpired(org)) {
    return org.trialPlan;
  }

  return org.plan || "free";
}

/**
 * @param {Object} org - Organization (plan, extraUserSlots)
 */
export function getEffectiveMaxUsers(org) {
  if (!org) return 1;
  const plan = getEffectivePlan(org);
  const limits = getPlanLimits(plan);
  if (limits.maxUsers === 1) return 1;
  if (limits.baseMaxUsers != null) {
    const extra = Math.min(org.extraUserSlots ?? 0, limits.maxExtraUserSlots ?? 0);
    return limits.baseMaxUsers + extra;
  }
  return null;
}

/**
 * @param {Object} org
 * @param {string} resource - properties | users | stockLocations | supplyItems | skus | inventoryItems
 * @param {number} currentCount
 * @returns {{ allowed: boolean, canCreate: boolean, used: number, max: number|null, plan: string, resource: string }}
 */
export function canCreateResource(org, resource, currentCount) {
  const plan = getEffectivePlan(org);
  const limits = getPlanLimits(plan);
  const max =
    resource === "users"
      ? getEffectiveMaxUsers(org)
      : getResourceMax(limits, resource);
  const allowed = isWithinLimit(max, currentCount);
  return {
    allowed,
    canCreate: allowed,
    used: currentCount,
    current: currentCount,
    max,
    limit: max,
    plan,
    resource,
  };
}

/**
 * @param {Object} org - Organization
 * @param {number} currentPropertyCount - Properties on the active team
 */
export function canCreateProperty(org, currentPropertyCount) {
  return canCreateResource(org, "properties", currentPropertyCount);
}

/**
 * Build PLAN_LIMIT 403 body from a canCreateResource result.
 */
export function toPlanLimitResponse(check, message) {
  return planLimitErrorBody({
    plan: check.plan,
    resource: check.resource,
    used: check.used,
    max: check.max,
    message,
  });
}

/**
 * Downgrade expired trials to free plan (does not delete excess resources — BR-20)
 */
export async function downgradeExpiredTrials() {
  try {
    const now = new Date();
    const freeLimits = getPlanLimits("free");

    const expiredTrials = await prisma.organization.findMany({
      where: {
        isOnTrial: true,
        trialEndsAt: {
          lt: now,
        },
      },
    });

    console.log(`[TRIAL] Found ${expiredTrials.length} expired trials to downgrade`);

    for (const org of expiredTrials) {
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          plan: "free",
          isOnTrial: false,
          trialEndsAt: null,
          trialPlan: null,
          maxProperties: freeLimits.maxProperties ?? 1,
        },
      });
      console.log(`[TRIAL] Downgraded organization ${org.id} (${org.name}) from trial to free`);
    }

    return expiredTrials.length;
  } catch (err) {
    console.warn("[TRIAL] downgradeExpiredTrials failed:", err.message);
    return 0;
  }
}

/**
 * @param {Object} org - Organization
 */
export function getTrialStatus(org) {
  if (!org?.isOnTrial || !org.trialEndsAt) {
    return {
      isOnTrial: false,
      daysRemaining: 0,
      expired: false,
    };
  }

  const now = new Date();
  const endsAt = new Date(org.trialEndsAt);
  const daysRemaining = Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)));
  const expired = now > endsAt;

  return {
    isOnTrial: true,
    trialPlan: org.trialPlan,
    endsAt: org.trialEndsAt,
    daysRemaining,
    expired,
  };
}
