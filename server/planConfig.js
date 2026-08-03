/**
 * Live plan limits — loaded once at boot from plan-limits.json
 * (override path with PLAN_LIMITS_PATH). Restart required after edits.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(__dirname, "plan-limits.json");

const RESOURCE_LIMIT_KEYS = {
  properties: "maxProperties",
  stockLocations: "maxStockLocations",
  supplyItems: "maxSupplyItems",
  skus: "maxSkus",
  inventoryItems: "maxInventoryItems",
};

function loadConfig() {
  const configPath = process.env.PLAN_LIMITS_PATH
    ? path.resolve(process.env.PLAN_LIMITS_PATH)
    : DEFAULT_PATH;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(
      `[planConfig] Failed to load plan limits from ${configPath}: ${err.message}`
    );
  }
  if (!raw?.plans?.free || !raw?.plans?.starter || !raw?.plans?.pro) {
    throw new Error(`[planConfig] Invalid plan-limits file (need free/starter/pro): ${configPath}`);
  }
  console.log(`[planConfig] Loaded plan limits from ${configPath}`);
  return { configPath, data: raw };
}

const { data: planData } = loadConfig();

export function getAllPlans() {
  return {
    currency: planData.currency || "USD",
    extraUserPrice: planData.extraUserPrice ?? 5,
    plans: planData.plans,
  };
}

/**
 * @param {string} plan
 * @returns {object}
 */
export function getPlanLimits(plan) {
  const key = typeof plan === "string" ? plan.toLowerCase() : "free";
  return planData.plans[key] || planData.plans.free;
}

/**
 * @param {object|null} limits
 * @param {string} resource - properties | stockLocations | supplyItems | skus | inventoryItems | users
 * @param {number|null} effectiveMaxUsers - for users resource
 */
export function getResourceMax(limits, resource, effectiveMaxUsers = null) {
  if (resource === "users") {
    return effectiveMaxUsers;
  }
  const key = RESOURCE_LIMIT_KEYS[resource];
  if (!key || !limits) return null;
  const max = limits[key];
  return max === undefined ? null : max;
}

/**
 * @param {number|null|undefined} max
 * @param {number} currentCount
 */
export function isWithinLimit(max, currentCount) {
  if (max == null) return true;
  return currentCount < max;
}

/**
 * @param {object} params
 * @param {string} params.plan
 * @param {string} params.resource
 * @param {number} params.used
 * @param {number|null} params.max
 * @param {string} [params.message]
 */
export function planLimitErrorBody({ plan, resource, used, max, message }) {
  const label =
    {
      properties: "properties",
      users: "users",
      stockLocations: "stock locations",
      supplyItems: "supply items",
      skus: "SKUs",
      inventoryItems: "inventory items",
    }[resource] || resource;

  return {
    code: "PLAN_LIMIT",
    resource,
    used,
    max,
    plan,
    message:
      message ||
      (max == null
        ? `Plan limit reached for ${label}.`
        : `${label.charAt(0).toUpperCase() + label.slice(1)} limit reached (${used}/${max}). Upgrade your plan to add more.`),
    upgradePath: "/pricing",
    upgradeAvailable: true,
  };
}
