/**
 * Trial Management Module
 * Handles free trial logic for Pro plan (14 days)
 */

import { prisma } from './db.js';

/**
 * Start a 14-day Pro trial for a team (10 properties during trial)
 * @param {string} teamId - The team ID to start trial for
 * @returns {Promise<Object>} Updated team object
 */
export async function startProTrial(teamId) {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14 days from now
  const limits = getPlanLimits('pro');

  return await prisma.team.update({
    where: { id: teamId },
    data: {
      plan: 'pro',
      isOnTrial: true,
      trialEndsAt: trialEndsAt,
      trialPlan: 'pro',
      maxProperties: limits.maxProperties, // 10 for Pro
    },
  });
}

/**
 * Start a 14-day Starter trial for a team (3 properties during trial)
 * @param {string} teamId - The team ID to start trial for
 * @returns {Promise<Object>} Updated team object
 */
export async function startStarterTrial(teamId) {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14 days from now
  const limits = getPlanLimits('starter');

  return await prisma.team.update({
    where: { id: teamId },
    data: {
      plan: 'starter',
      isOnTrial: true,
      trialEndsAt: trialEndsAt,
      trialPlan: 'starter',
      maxProperties: limits.maxProperties, // 3 for Starter
    },
  });
}

/**
 * Check if a team's trial has expired
 * @param {Object} team - Team object with trial fields
 * @returns {boolean} True if trial has expired
 */
export function isTrialExpired(team) {
  if (!team.isOnTrial || !team.trialEndsAt) {
    return false;
  }
  return new Date() > new Date(team.trialEndsAt);
}

/**
 * Get the effective plan for a team (considering trial status)
 * @param {Object} team - Team object
 * @returns {string} The effective plan name
 */
export function getEffectivePlan(team) {
  if (!team) return 'free';
  
  // If on trial and not expired, use the trial plan
  if (team.isOnTrial && team.trialPlan && !isTrialExpired(team)) {
    return team.trialPlan;
  }
  
  // Otherwise use the regular plan
  return team.plan || 'free';
}

/**
 * Get plan limits based on plan name
 * @param {string} plan - Plan name (free, starter, pro)
 * @returns {Object} Plan limits
 */
export function getPlanLimits(plan) {
  const limits = {
    free: {
      maxProperties: 1,
      maxUsers: 1,
      maxInventoryItems: 30,
      features: ['basic_tracking'],
    },
    starter: {
      maxProperties: 3,
      baseMaxUsers: 3,
      maxExtraUserSlots: 2, // $5/mo each, max 2 extra = 5 users total
      maxUsers: null, // use getEffectiveMaxUsers(team) for starter
      maxInventoryItems: null, // unlimited
      features: ['basic_tracking', 'exports', 'invoices', 'history', 'inventory_by_property', 'low_stock_alerts', 'usage_summary', 'value_per_property', 'csv_export'],
    },
    pro: {
      maxProperties: 10,
      baseMaxUsers: 5,
      maxExtraUserSlots: 3, // $5/mo each, max 3 extra = 8 users total
      maxUsers: null, // use getEffectiveMaxUsers(team) for pro
      maxInventoryItems: null, // unlimited
      features: ['basic_tracking', 'exports', 'invoices', 'history', 'team_members', 'permissions', 'advanced_reports', 'value_tracking', 'reports', 'shopping_list', 'invoicing'],
    },
  };
  
  return limits[plan] || limits.free;
}

/**
 * Get effective max users for a team (Free: 1; Starter: 3 + extra up to 2; Pro: 5 + extra up to 3)
 * @param {Object} team - Team object (with plan, extraUserSlots)
 * @returns {number | null} Max users (null = unlimited)
 */
export function getEffectiveMaxUsers(team) {
  if (!team) return 1;
  const plan = getEffectivePlan(team);
  const limits = getPlanLimits(plan);
  if (limits.maxUsers === 1) return 1;
  if (limits.baseMaxUsers != null) {
    const extra = Math.min(team.extraUserSlots ?? 0, limits.maxExtraUserSlots ?? 0);
    return limits.baseMaxUsers + extra;
  }
  return null; // unlimited
}

/**
 * Check if a team can create more properties based on their plan
 * @param {Object} team - Team object
 * @param {number} currentPropertyCount - Current number of properties
 * @returns {Object} { canCreate: boolean, limit: number, current: number }
 */
export function canCreateProperty(team, currentPropertyCount) {
  const effectivePlan = getEffectivePlan(team);
  const limits = getPlanLimits(effectivePlan);
  
  return {
    canCreate: currentPropertyCount < limits.maxProperties,
    limit: limits.maxProperties,
    current: currentPropertyCount,
    plan: effectivePlan,
  };
}

/**
 * Downgrade expired trials to free plan
 * This should be run as a scheduled job (cron)
 * @returns {Promise<number>} Number of teams downgraded
 */
export async function downgradeExpiredTrials() {
  try {
    const now = new Date();

    const expiredTrials = await prisma.team.findMany({
      where: {
        isOnTrial: true,
        trialEndsAt: {
          lt: now,
        },
      },
    });

    console.log(`[TRIAL] Found ${expiredTrials.length} expired trials to downgrade`);

    for (const team of expiredTrials) {
      await prisma.team.update({
        where: { id: team.id },
        data: {
          plan: "free",
          isOnTrial: false,
          trialEndsAt: null,
          trialPlan: null,
          maxProperties: 1,
        },
      });
      console.log(`[TRIAL] Downgraded team ${team.id} (${team.name}) from trial to free`);
    }

    return expiredTrials.length;
  } catch (err) {
    console.warn("[TRIAL] downgradeExpiredTrials failed (Team table may be missing columns):", err.message);
    return 0;
  }
}

/**
 * Get trial status for a team
 * @param {Object} team - Team object
 * @returns {Object} Trial status information
 */
export function getTrialStatus(team) {
  if (!team.isOnTrial || !team.trialEndsAt) {
    return {
      isOnTrial: false,
      daysRemaining: 0,
      expired: false,
    };
  }
  
  const now = new Date();
  const endsAt = new Date(team.trialEndsAt);
  const daysRemaining = Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)));
  const expired = now > endsAt;
  
  return {
    isOnTrial: true,
    trialPlan: team.trialPlan,
    endsAt: team.trialEndsAt,
    daysRemaining,
    expired,
  };
}
