import crypto from "crypto";
import {
  userOps,
  teamOps,
  organizationOps,
  membershipOps,
  invitationOps,
  propertyOps,
  stockLocationOps,
  supplyItemOps,
  skuOps,
} from "../db.js";
import { sendInvitationEmail } from "../email.js";
import {
  startProTrial,
  startStarterTrial,
  getEffectivePlan,
  getPlanLimits,
  getEffectiveMaxUsers,
  getTrialStatus,
  toPlanLimitResponse,
  canCreateResource,
} from "../trialManager.js";
import {
  VALID_TEAM_ROLES,
} from "../middleware/authHelpers.js";

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function registerTeamRoutes(app, deps) {
  const {
    authenticateToken,
    loadCurrentUser,
    userHasPageAccess,
    ensureMembershipContext,
    buildAuthUserPayload,
  } = deps;

// ==================== TEAM & INVITE ROUTES ====================

// Get team usage vs plan limits (no settings access required – used by banner / create flows)
app.get("/api/team/limits", authenticateToken, async (req, res) => {
  try {
    const ctx = await ensureMembershipContext(req.user.id);
    if (!ctx?.team || !ctx.organization) {
      return res.status(404).json({ message: "Team not found for user" });
    }
    const teamId = ctx.team.id;
    const org = ctx.organization;
    const effectivePlan = getEffectivePlan(org);
    const planLimits = getPlanLimits(effectivePlan);
    const effectiveMaxUsers = getEffectiveMaxUsers(org);

    const [
      propertyCount,
      userCount,
      stockLocationCount,
      supplyItemCount,
      skuCount,
    ] = await Promise.all([
      propertyOps.countByTeam(teamId),
      membershipOps.countByTeam(teamId),
      stockLocationOps.countActiveByTeam(teamId),
      supplyItemOps.countActiveByTeam(teamId),
      skuOps.countActiveByTeam(teamId),
    ]);

    const usageEntry = (resource, used, max) => ({
      used,
      max,
      overLimit: max != null && used > max,
      atLimit: max != null && used >= max,
    });

    const properties = usageEntry("properties", propertyCount, planLimits.maxProperties);
    const users = usageEntry("users", userCount, effectiveMaxUsers);
    const stockLocations = usageEntry(
      "stockLocations",
      stockLocationCount,
      planLimits.maxStockLocations ?? null
    );
    const supplyItems = usageEntry(
      "supplyItems",
      supplyItemCount,
      planLimits.maxSupplyItems ?? null
    );
    const skus = usageEntry("skus", skuCount, planLimits.maxSkus ?? null);
    const inventoryItems = usageEntry(
      "inventoryItems",
      skuCount,
      planLimits.maxInventoryItems ?? null
    );

    const resources = {
      properties,
      users,
      stockLocations,
      supplyItems,
      skus,
      inventoryItems,
    };
    const overLimit = Object.values(resources).some((r) => r.overLimit);

    res.json({
      effectivePlan,
      effectiveMaxProperties: planLimits.maxProperties,
      effectiveMaxUsers,
      overLimit,
      resources,
    });
  } catch (error) {
    console.error("Error fetching team limits:", error);
    res.status(500).json({ message: "Error fetching team limits" });
  }
});

app.get("/api/team/name", authenticateToken, async (req, res) => {
  try {
    const ctx = await ensureMembershipContext(req.user.id);
    if (!ctx?.user) {
      return res.status(404).json({ message: "Team not found for user" });
    }
    const name =
      ctx.team?.name?.trim() ||
      `${ctx.user.name || ctx.user.email.split("@")[0]}'s Team`;
    res.json({ name });
  } catch (error) {
    console.error("Error fetching team name:", error);
    res.status(500).json({ message: "Error fetching team name" });
  }
});

app.get("/api/team", authenticateToken, async (req, res) => {
  try {
    const ctx = await ensureMembershipContext(req.user.id);
    const user = ctx?.user;
    if (!user?.teamId || !ctx.team || !ctx.organization) {
      return res.status(404).json({ message: "Team not found for user" });
    }
    if (!userHasPageAccess(user, "settings")) {
      return res.status(403).json({ message: "You do not have access to Settings." });
    }

    const team = ctx.team;
    const org = ctx.organization;
    const membershipRows = await membershipOps.findAllByTeam(team.id);
    const currentUserId = req.user.id;
    const isOrgOwner = org.ownerId === user.id;
    const canSeeMemberPii = user.teamRole === "owner" || isOrgOwner;
    const membersFormatted = membershipRows.map((m) => {
      const u = m.user;
      const base = {
        id: u.id,
        teamRole: m.teamRole || (u.id === team.ownerId ? "owner" : "member"),
        maxInventoryItems: m.maxInventoryItems ?? null,
        allowedPages: m.allowedPages ?? null,
        allowedPropertyIds: m.allowedPropertyIds ?? null,
      };
      if (u.id === currentUserId || canSeeMemberPii) {
        return {
          ...base,
          email: u.email,
          name: u.name,
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
        };
      }
      return { ...base, isTeammate: true };
    });

    const invitations = await invitationOps.findAllByTeam(team.id);
    const invitationsFormatted = invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      teamRole: inv.teamRole,
      maxInventoryItems: inv.maxInventoryItems ?? null,
      status: inv.status,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      allowedPages: inv.allowedPages ?? null,
      allowedPropertyIds: inv.allowedPropertyIds ?? null,
    }));

    const propertyCount = await propertyOps.countByTeam(team.id);
    const trialStatus = getTrialStatus(org);
    const effectivePlan = getEffectivePlan(org);
    const planLimits = getPlanLimits(effectivePlan);
    const effectiveMaxProperties = planLimits.maxProperties;
    const effectiveMaxUsers = getEffectiveMaxUsers(org);

    let invoiceStyle = null;
    if (org.invoiceStyle) {
      try {
        invoiceStyle =
          typeof org.invoiceStyle === "string" ? JSON.parse(org.invoiceStyle) : org.invoiceStyle;
      } catch (_) {}
    }

    const orgOwnerUser = org.ownerId ? await userOps.findById(org.ownerId) : null;
    const orgOwners = orgOwnerUser
      ? [
          {
            id: orgOwnerUser.id,
            name:
              orgOwnerUser.name ||
              [orgOwnerUser.firstName, orgOwnerUser.lastName].filter(Boolean).join(" ").trim() ||
              null,
            email: orgOwnerUser.email,
            firstName: orgOwnerUser.firstName ?? null,
            lastName: orgOwnerUser.lastName ?? null,
          },
        ]
      : [];

    const orgTeams = await teamOps.findAllByOrganization(org.id);
    const userMemberships = await membershipOps.findAllByUser(user.id);
    const membershipByTeamId = new Map(userMemberships.map((m) => [m.teamId, m]));
    const organizationTeams = [];
    for (const t of orgTeams) {
      const memberCount = await membershipOps.countByTeam(t.id);
      const myMembership = membershipByTeamId.get(t.id);
      organizationTeams.push({
        id: t.id,
        name: t.name,
        memberCount,
        isActive: t.id === team.id,
        isMember: Boolean(myMembership),
        myTeamRole: myMembership?.teamRole ?? null,
      });
    }

    res.json({
      team: {
        id: team.id,
        name: team.name,
        ownerId: team.ownerId,
        organizationId: org.id,
        organizationName: org.name,
        isOrgOwner,
        plan: org.plan || "free",
        effectivePlan,
        maxProperties: org.maxProperties,
        effectiveMaxProperties,
        extraUserSlots: org.extraUserSlots ?? 0,
        effectiveMaxUsers,
        propertyCount,
        billingInterval: org.billingInterval || null,
        isOnTrial: org.isOnTrial || false,
        trialEndsAt: org.trialEndsAt,
        trialStatus,
        billingPortalAvailable: Boolean(org.stripeCustomerId),
        invoiceLogoUrl: org.invoiceLogoUrl ?? null,
        invoiceStyle,
        billingTimezone: team.billingTimezone || "America/Toronto",
      },
      organization: {
        id: org.id,
        name: org.name,
        owners: orgOwners,
      },
      organizationTeams,
      members: membersFormatted,
      invitations: invitationsFormatted,
    });
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ message: "Error fetching team information" });
  }
});

// Update team name (team owner) and/or org invoice branding (org owner)
app.patch("/api/team", authenticateToken, async (req, res) => {
  try {
    const ctx = await ensureMembershipContext(req.user.id);
    const currentUser = ctx?.user;
    if (!currentUser?.teamId || !ctx.team || !ctx.organization) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (!userHasPageAccess(currentUser, "settings")) {
      return res.status(403).json({ message: "You do not have access to Settings." });
    }

    const teamUpdates = {};
    const orgUpdates = {};

    if (typeof req.body.name === "string" && req.body.name.trim()) {
      if (currentUser.teamRole !== "owner") {
        return res.status(403).json({ message: "Only team owners can rename the team" });
      }
      teamUpdates.name = req.body.name.trim();
    }

    if (typeof req.body.organizationName === "string" && req.body.organizationName.trim()) {
      if (!currentUser.isOrgOwner) {
        return res.status(403).json({ message: "Only the organization owner can rename the organization" });
      }
      orgUpdates.name = req.body.organizationName.trim();
    }

    if (req.body.invoiceLogoUrl !== undefined || req.body.invoiceStyle !== undefined) {
      if (!currentUser.isOrgOwner) {
        return res.status(403).json({ message: "Only the organization owner can update invoice branding" });
      }
      if (req.body.invoiceLogoUrl !== undefined) {
        orgUpdates.invoiceLogoUrl =
          req.body.invoiceLogoUrl == null || req.body.invoiceLogoUrl === ""
            ? null
            : String(req.body.invoiceLogoUrl).trim() || null;
      }
      if (req.body.invoiceStyle !== undefined) {
        orgUpdates.invoiceStyle =
          req.body.invoiceStyle == null
            ? null
            : typeof req.body.invoiceStyle === "string"
              ? req.body.invoiceStyle
              : JSON.stringify(req.body.invoiceStyle);
      }
    }

    if (typeof req.body.billingTimezone === "string" && req.body.billingTimezone.trim()) {
      if (currentUser.teamRole !== "owner") {
        return res.status(403).json({ message: "Only team owners can update billing timezone" });
      }
      teamUpdates.billingTimezone = req.body.billingTimezone.trim();
    }

    if (Object.keys(teamUpdates).length === 0 && Object.keys(orgUpdates).length === 0) {
      return res.status(400).json({ message: "No valid updates provided" });
    }

    if (Object.keys(teamUpdates).length > 0) {
      await teamOps.update(currentUser.teamId, teamUpdates);
    }
    if (Object.keys(orgUpdates).length > 0) {
      await organizationOps.update(ctx.organization.id, orgUpdates);
    }

    const updatedTeam = await teamOps.findById(currentUser.teamId);
    const updatedOrg = await organizationOps.findById(ctx.organization.id);
    let invoiceStyle = null;
    if (updatedOrg.invoiceStyle) {
      try {
        invoiceStyle =
          typeof updatedOrg.invoiceStyle === "string"
            ? JSON.parse(updatedOrg.invoiceStyle)
            : updatedOrg.invoiceStyle;
      } catch (_) {}
    }
    res.json({
      team: {
        id: updatedTeam.id,
        name: updatedTeam.name,
        billingTimezone: updatedTeam.billingTimezone || "America/Toronto",
        organizationId: updatedOrg.id,
        organizationName: updatedOrg.name,
        invoiceLogoUrl: updatedOrg.invoiceLogoUrl ?? null,
        invoiceStyle,
      },
      organization: {
        id: updatedOrg.id,
        name: updatedOrg.name,
      },
    });
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).json({ message: "Error updating team" });
  }
});

app.post("/api/team/invitations", authenticateToken, async (req, res) => {
  try {
    const {
      email,
      teamRole = "member",
      maxInventoryItems = null,
      allowedPages = null,
      allowedPropertyIds = null,
    } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    if (!VALID_TEAM_ROLES.has(teamRole)) {
      return res.status(400).json({ message: "teamRole must be owner, member, or viewer." });
    }

    const ctx = await ensureMembershipContext(req.user.id);
    const currentUser = ctx?.user;
    if (!currentUser?.teamId || !ctx.team || !ctx.organization) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (!userHasPageAccess(currentUser, "settings")) {
      return res.status(403).json({ message: "You do not have access to Settings." });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can invite new members" });
    }

    const team = ctx.team;
    const org = ctx.organization;
    const effectivePlan = getEffectivePlan(org);
    const effectiveMaxUsers = getEffectiveMaxUsers(org);
    if (effectiveMaxUsers !== null) {
      const memberCount = await membershipOps.countByTeam(currentUser.teamId);
      const userCheck = canCreateResource(org, "users", memberCount);
      if (!userCheck.allowed) {
        const msg =
          effectiveMaxUsers === 1
            ? "Free plan allows only 1 user. Upgrade to Starter or Pro to add team members."
            : effectivePlan === "starter"
              ? `Starter plan allows ${effectiveMaxUsers} users. You can add up to 2 extra users at $5/mo each in Settings.`
              : `Pro plan allows ${effectiveMaxUsers} users. You can add up to 3 extra users at $5/mo each in Settings.`;
        return res.status(403).json(toPlanLimitResponse(userCheck, msg));
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const normalisedAllowedPages =
      Array.isArray(allowedPages) && allowedPages.length > 0 ? allowedPages : null;
    const normalisedAllowedPropertyIds =
      Array.isArray(allowedPropertyIds) && allowedPropertyIds.length > 0
        ? allowedPropertyIds
        : null;

    const invitation = await invitationOps.create({
      teamId: currentUser.teamId,
      email,
      teamRole,
      maxInventoryItems: typeof maxInventoryItems === "number" ? maxInventoryItems : null,
      allowedPages: normalisedAllowedPages,
      allowedPropertyIds: normalisedAllowedPropertyIds,
      status: "pending",
      token: crypto.randomUUID(),
      expiresAt,
      invitedByUserId: currentUser.id,
    });

    const teamName = team.name?.trim() || "the team";
    const inviterName = currentUser.name?.trim() || "A team owner";
    sendInvitationEmail(invitation.email, invitation.token, teamName, inviterName).catch((err) => {
      console.error("Failed to send invitation email:", err?.message || err);
    });

    res.status(201).json({
      id: invitation.id,
      email: invitation.email,
      teamRole: invitation.teamRole,
      maxInventoryItems: invitation.maxInventoryItems,
      status: invitation.status,
      token: invitation.token,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      allowedPages: invitation.allowedPages,
      allowedPropertyIds: invitation.allowedPropertyIds,
    });
  } catch (error) {
    console.error("Error creating invitation:", error);
    res.status(500).json({ message: "Error creating invitation" });
  }
});

app.post("/api/team/invitations/accept", authenticateToken, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ message: "Invitation token is required" });
    }

    const invitation = await invitationOps.findByToken(token);
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    if (invitation.status !== "pending") {
      return res.status(400).json({ message: "Invitation is no longer valid" });
    }

    const now = new Date();
    if (invitation.expiresAt && new Date(invitation.expiresAt) < now) {
      await invitationOps.update(invitation.id, { status: "expired" });
      return res.status(400).json({ message: "Invitation has expired" });
    }

    const rawUser = await userOps.findById(req.user.id);
    if (!rawUser) {
      return res.status(404).json({ message: "User not found" });
    }
    if (rawUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({
        message:
          "This invitation was sent to a different email address. Sign in with the email that received the invite.",
      });
    }

    const team = await teamOps.findById(invitation.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    const org = await organizationOps.findById(team.organizationId);
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }
    const existingMembership = await membershipOps.findByUserAndTeam(rawUser.id, invitation.teamId);
    if (!existingMembership) {
      const effectiveMaxUsers = getEffectiveMaxUsers(org);
      if (effectiveMaxUsers !== null) {
        const memberCount = await membershipOps.countByTeam(invitation.teamId);
        const userCheck = canCreateResource(org, "users", memberCount);
        if (!userCheck.allowed) {
          return res.status(403).json(
            toPlanLimitResponse(
              userCheck,
              "This team has reached its user limit. Ask the owner to upgrade or free a seat."
            )
          );
        }
      }
    }

    await membershipOps.upsertForUserTeam(rawUser.id, invitation.teamId, {
      teamRole: invitation.teamRole || "member",
      maxInventoryItems:
        typeof invitation.maxInventoryItems === "number" ? invitation.maxInventoryItems : null,
      allowedPages:
        Array.isArray(invitation.allowedPages) && invitation.allowedPages.length > 0
          ? invitation.allowedPages
          : null,
      allowedPropertyIds:
        Array.isArray(invitation.allowedPropertyIds) && invitation.allowedPropertyIds.length > 0
          ? invitation.allowedPropertyIds
          : null,
    });

    if (!rawUser.activeTeamId) {
      await userOps.update(rawUser.id, { activeTeamId: invitation.teamId });
    } else {
      await userOps.update(rawUser.id, { activeTeamId: invitation.teamId });
    }

    await invitationOps.update(invitation.id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: rawUser.id,
    });

    const ctx = await ensureMembershipContext(rawUser.id);
    res.json({
      message: "Invitation accepted successfully",
      user: buildAuthUserPayload(ctx),
      teamId: invitation.teamId,
      teamRole: invitation.teamRole || "member",
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ message: "Error accepting invitation" });
  }
});

app.patch("/api/team/members/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can edit members" });
    }
    const targetUserId = req.params.userId;
    if (targetUserId === currentUser.id) {
      return res.status(400).json({ message: "You cannot edit your own role from here" });
    }
    const membership = await membershipOps.findByUserAndTeam(targetUserId, currentUser.teamId);
    if (!membership) {
      return res.status(404).json({ message: "Member not found in your team" });
    }
    const { teamRole, maxInventoryItems, allowedPages, allowedPropertyIds } = req.body || {};
    const updates = {};
    if (teamRole !== undefined) {
      if (!VALID_TEAM_ROLES.has(teamRole) || teamRole === "owner") {
        return res.status(400).json({ message: "teamRole must be member or viewer." });
      }
      updates.teamRole = teamRole;
    }
    if (typeof maxInventoryItems === "number" || maxInventoryItems === null) {
      updates.maxInventoryItems = maxInventoryItems;
    }
    if (Array.isArray(allowedPages)) updates.allowedPages = allowedPages;
    if (Array.isArray(allowedPropertyIds)) updates.allowedPropertyIds = allowedPropertyIds;
    const updated = await membershipOps.update(membership.id, updates);
    const targetUser = await userOps.findById(targetUserId);
    res.json({
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      teamRole: updated.teamRole,
      maxInventoryItems: updated.maxInventoryItems ?? null,
      allowedPages: updated.allowedPages ?? null,
      allowedPropertyIds: updated.allowedPropertyIds ?? null,
    });
  } catch (error) {
    console.error("Error updating member:", error);
    res.status(500).json({ message: "Error updating member" });
  }
});

app.delete("/api/team/members/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can remove members" });
    }
    const targetUserId = req.params.userId;
    if (targetUserId === currentUser.id) {
      return res.status(400).json({ message: "You cannot remove yourself from the team" });
    }
    const membership = await membershipOps.findByUserAndTeam(targetUserId, currentUser.teamId);
    if (!membership) {
      return res.status(404).json({ message: "Member not found in your team" });
    }
    await membershipOps.deleteByUserAndTeam(targetUserId, currentUser.teamId);
    const target = await userOps.findById(targetUserId);
    if (target?.activeTeamId === currentUser.teamId) {
      const remaining = await membershipOps.findAllByUser(targetUserId);
      await userOps.update(targetUserId, {
        activeTeamId: remaining[0]?.teamId ?? null,
      });
    }
    res.json({ message: "Member removed from team" });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ message: "Error removing member" });
  }
});

app.patch("/api/team/invitations/:invitationId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can edit invitations" });
    }
    const invitation = await invitationOps.findById(req.params.invitationId);
    if (!invitation || invitation.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    if (invitation.status !== "pending") {
      return res.status(400).json({ message: "Only pending invitations can be edited" });
    }
    const { teamRole, maxInventoryItems, allowedPages, allowedPropertyIds } = req.body || {};
    const updates = {};
    if (teamRole !== undefined) {
      if (!VALID_TEAM_ROLES.has(teamRole)) {
        return res.status(400).json({ message: "teamRole must be owner, member, or viewer." });
      }
      updates.teamRole = teamRole;
    }
    if (typeof maxInventoryItems === "number" || maxInventoryItems === null) updates.maxInventoryItems = maxInventoryItems;
    if (Array.isArray(allowedPages)) updates.allowedPages = allowedPages;
    if (Array.isArray(allowedPropertyIds)) updates.allowedPropertyIds = allowedPropertyIds;
    const updated = await invitationOps.update(invitation.id, updates);
    res.json({
      id: updated.id,
      email: updated.email,
      teamRole: updated.teamRole,
      maxInventoryItems: updated.maxInventoryItems ?? null,
      status: updated.status,
      allowedPages: updated.allowedPages ?? null,
      allowedPropertyIds: updated.allowedPropertyIds ?? null,
    });
  } catch (error) {
    console.error("Error updating invitation:", error);
    res.status(500).json({ message: "Error updating invitation" });
  }
});

app.delete("/api/team/invitations/:invitationId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can revoke invitations" });
    }
    const invitation = await invitationOps.findById(req.params.invitationId);
    if (!invitation || invitation.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    await invitationOps.delete(invitation.id);
    res.json({ message: "Invitation revoked" });
  } catch (error) {
    console.error("Error deleting invitation:", error);
    res.status(500).json({ message: "Error deleting invitation" });
  }
});


app.post("/api/team/start-trial", authenticateToken, async (req, res) => {
  try {
    const user = await loadCurrentUser(req);
    if (!user?.organizationId) {
      return res.status(404).json({ message: "Organization not found for user" });
    }
    if (!user.isOrgOwner) {
      return res.status(403).json({ message: "Only the organization owner can start trials" });
    }

    const org = await organizationOps.findById(user.organizationId);
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }
    if (org.isOnTrial) {
      return res.status(400).json({ message: "Organization is already on a trial" });
    }
    if (org.plan !== "free") {
      return res.status(400).json({ message: "Trials are only available for free plan organizations" });
    }

    const plan = req.body?.plan === "starter" ? "starter" : "pro";
    const updatedOrg =
      plan === "starter" ? await startStarterTrial(org.id) : await startProTrial(org.id);
    const trialStatus = getTrialStatus(updatedOrg);

    res.json({
      message: `14-day ${plan === "starter" ? "Starter" : "Pro"} trial started successfully!`,
      trial: trialStatus,
      team: {
        plan: updatedOrg.plan,
        effectivePlan: getEffectivePlan(updatedOrg),
        maxProperties: updatedOrg.maxProperties,
      },
    });
  } catch (error) {
    console.error("Error starting trial:", error);
    res.status(500).json({ message: "Error starting trial" });
  }
});
}
