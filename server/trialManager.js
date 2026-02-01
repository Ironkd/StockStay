/**
 * Trial Management Module
 * Handles free trial logic for Pro plan (14 days)
 */

import { prisma } from './db.js';

/**
 * Start a 14-day Pro trial for a team (10 warehouses during trial)
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
      maxWarehouses: limits.maxWarehouses, // 10 for Pro
    },
  });
}

/**
 * Start a 14-day Starter trial for a team (3 warehouses during trial)
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
      maxWarehouses: limits.maxWarehouses, // 3 for Starter
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
      maxWarehouses: 1,
      features: ['basic_tracking'],
    },
    starter: {
      maxWarehouses: 3,
      features: ['basic_tracking', 'exports', 'invoices', 'history'],
    },
    pro: {
      maxWarehouses: 10,
      features: ['basic_tracking', 'exports', 'invoices', 'history', 'team_members', 'permissions', 'advanced_reports', 'value_tracking'],
    },
  };
  
  return limits[plan] || limits.free;
}

/**
 * Check if a team can create more warehouses based on their plan
 * @param {Object} team - Team object
 * @param {number} currentWarehouseCount - Current number of warehouses
 * @returns {Object} { canCreate: boolean, limit: number, current: number }
 */
export function canCreateWarehouse(team, currentWarehouseCount) {
  const effectivePlan = getEffectivePlan(team);
  const limits = getPlanLimits(effectivePlan);
  
  return {
    canCreate: currentWarehouseCount < limits.maxWarehouses,
    limit: limits.maxWarehouses,
    current: currentWarehouseCount,
    plan: effectivePlan,
  };
}

/**
 * Downgrade expired trials to free plan
 * This should be run as a scheduled job (cron)
 * @returns {Promise<number>} Number of teams downgraded
 */
export async function downgradeExpiredTrials() {
  const now = new Date();
  
  // Find all teams with expired trials
  const expiredTrials = await prisma.team.findMany({
    where: {
      isOnTrial: true,
      trialEndsAt: {
        lt: now, // Trial end date is in the past
      },
    },
  });
  
  console.log(`[TRIAL] Found ${expiredTrials.length} expired trials to downgrade`);
  
  // Downgrade each team to free plan
  for (const team of expiredTrials) {
    await prisma.team.update({
      where: { id: team.id },
      data: {
        plan: 'free',
        isOnTrial: false,
        trialEndsAt: null,
        trialPlan: null,
        maxWarehouses: 1, // Free plan limit
      },
    });
    
    console.log(`[TRIAL] Downgraded team ${team.id} (${team.name}) from trial to free`);
  }
  
  return expiredTrials.length;
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
