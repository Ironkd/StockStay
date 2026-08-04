/**
 * Shared auth / membership helpers used by route modules.
 */

import jwt from "jsonwebtoken";
import {
  getMembershipContext,
  provisionOrganizationWithTeam,
} from "../db.js";
import { getEffectivePlan, getPlanLimits } from "../trialManager.js";

export const VALID_TEAM_ROLES = new Set(["owner", "member", "viewer"]);

/** Create JWT auth middleware bound to a secret. */
export function createAuthenticateToken(JWT_SECRET) {
  return function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired token" });
      }
      req.user = user;
      next();
    });
  };
}

/** Ensure user has an org+team; return enriched membership context. */
export async function ensureMembershipContext(userId) {
  let ctx = await getMembershipContext(userId);
  if (!ctx) return null;
  if (!ctx.user.teamId) {
    const display = (ctx.user.name || ctx.user.email.split("@")[0] || "My").trim();
    await provisionOrganizationWithTeam({
      ownerUserId: ctx.user.id,
      organizationName: `${display}'s Organization`,
      teamName: `${display}'s Team`,
    });
    ctx = await getMembershipContext(userId);
  }
  return ctx;
}

/** Enriched user with teamId/teamRole/scopes aliases (for existing route handlers). */
export async function loadCurrentUser(req) {
  const ctx = await ensureMembershipContext(req.user.id);
  return ctx?.user ?? null;
}

export function buildAuthUserPayload(ctx) {
  const user = ctx.user;
  const org = ctx.organization;
  const team = ctx.team;
  const effectivePlan = getEffectivePlan(org);
  const planLimits = getPlanLimits(effectivePlan);
  const maxInventoryItems =
    user.maxInventoryItems ?? (planLimits.maxInventoryItems ?? null);
  const teamName =
    team?.name?.trim() ||
    `${user.name || user.email.split("@")[0]}'s Team`;
  return {
    id: user.id,
    email: user.email || "",
    name: user.name || "",
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    address: user.address ?? "",
    streetAddress: user.streetAddress ?? "",
    city: user.city ?? "",
    province: user.province ?? "",
    postalCode: user.postalCode ?? "",
    phone: user.phone ?? "",
    teamId: user.teamId ?? null,
    activeTeamId: user.teamId ?? null,
    teamName,
    teamRole: user.teamRole ?? null,
    organizationId: user.organizationId ?? null,
    isOrgOwner: Boolean(user.isOrgOwner),
    maxInventoryItems,
    allowedPages: user.allowedPages ?? null,
    allowedPropertyIds: user.allowedPropertyIds ?? null,
    memberships: ctx.memberships ?? [],
  };
}

/** Page-level access control. */
export function userHasPageAccess(user, pageKey) {
  if (!user) return false;
  // Home is always allowed
  if (pageKey === "home") return true;
  // Owners or users without restrictions can see everything
  if (!user.allowedPages || user.teamRole === "owner") return true;
  return Array.isArray(user.allowedPages) && user.allowedPages.includes(pageKey);
}

export const skipRateLimitInTests = () => process.env.NODE_ENV === "test";
