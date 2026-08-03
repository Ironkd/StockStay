import { apiRequest } from "../config/api";
import type { TeamData, TeamInvitationInfo, TeamMemberInfo, InvoiceStyle, TeamLimits } from "../types";

export const teamApi = {
  getTeam: async (): Promise<TeamData> => {
    return apiRequest<TeamData>("/team");
  },

  /** Team usage vs plan limits (no settings access required – banner / create flows) */
  getTeamLimits: async (): Promise<TeamLimits> => {
    return apiRequest<TeamLimits>("/team/limits");
  },

  /** Current team name only (no settings access – use from header so name updates everywhere) */
  getTeamName: async (): Promise<{ name: string }> => {
    return apiRequest<{ name: string }>("/team/name");
  },

  updateTeamName: async (name: string): Promise<{ team: { id: string; name: string } }> => {
    return apiRequest<{ team: { id: string; name: string } }>("/team", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  /** Update organization name (org owner only). */
  updateOrganizationName: async (
    organizationName: string
  ): Promise<{ organization: { id: string; name: string }; team: { organizationName: string } }> => {
    return apiRequest("/team", {
      method: "PATCH",
      body: JSON.stringify({ organizationName }),
    });
  },

  /** Update invoice email style and logo (org owner only). */
  updateInvoiceStyle: async (params: {
    invoiceLogoUrl?: string | null;
    invoiceStyle?: InvoiceStyle | null;
  }): Promise<{ team: { id: string; name: string; invoiceLogoUrl: string | null; invoiceStyle: InvoiceStyle | null } }> => {
    return apiRequest("/team", {
      method: "PATCH",
      body: JSON.stringify({
        invoiceLogoUrl: params.invoiceLogoUrl ?? undefined,
        invoiceStyle: params.invoiceStyle ?? undefined,
      }),
    });
  },

  /** Update team billing timezone (team owner only). */
  updateBillingTimezone: async (
    billingTimezone: string
  ): Promise<{ team: { id: string; name: string; billingTimezone: string } }> => {
    return apiRequest("/team", {
      method: "PATCH",
      body: JSON.stringify({ billingTimezone }),
    });
  },

  acceptInvitation: async (token: string): Promise<{ message: string; user?: import("./authApi").AuthUser }> => {
    return apiRequest("/team/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  createInvitation: async (params: {
    email: string;
    teamRole?: string;
    allowedPages?: string[] | null;
    allowedPropertyIds?: string[] | null;
    maxInventoryItems?: number | null;
  }): Promise<TeamInvitationInfo> => {
    return apiRequest<TeamInvitationInfo>("/team/invitations", {
      method: "POST",
      body: JSON.stringify({
        email: params.email,
        teamRole: params.teamRole || "member",
        allowedPages: params.allowedPages ?? null,
        allowedPropertyIds: params.allowedPropertyIds ?? null,
        maxInventoryItems: params.maxInventoryItems ?? null,
      }),
    });
  },

  updateInvitation: async (
    invitationId: string,
    params: {
      teamRole?: string;
      allowedPages?: string[] | null;
      allowedPropertyIds?: string[] | null;
      maxInventoryItems?: number | null;
    }
  ): Promise<TeamInvitationInfo> => {
    return apiRequest<TeamInvitationInfo>(`/team/invitations/${invitationId}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
  },

  revokeInvitation: async (invitationId: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/team/invitations/${invitationId}`, {
      method: "DELETE",
    });
  },

  updateMember: async (
    userId: string,
    params: {
      teamRole?: string;
      allowedPages?: string[] | null;
      allowedPropertyIds?: string[] | null;
      maxInventoryItems?: number | null;
    }
  ): Promise<TeamMemberInfo> => {
    return apiRequest<TeamMemberInfo>(`/team/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
  },

  removeMember: async (userId: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/team/members/${userId}`, {
      method: "DELETE",
    });
  },

  createOrganizationTeam: async (
    organizationId: string,
    name: string
  ): Promise<{
    team: { id: string; name: string; organizationId: string };
    user: import("./authApi").AuthUser;
  }> => {
    return apiRequest(`/organizations/${organizationId}/teams`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  getBillingPortalUrl: async (returnUrl?: string): Promise<{ url: string }> => {
    return apiRequest<{ url: string }>("/billing/customer-portal", {
      method: "POST",
      body: JSON.stringify(returnUrl ? { returnUrl } : {}),
    });
  },

  createCheckoutSession: async (params?: {
    plan?: "pro" | "starter";
    billingPeriod?: "monthly" | "annual";
    stripeTrialDays?: number;
  }): Promise<{ url: string }> => {
    return apiRequest<{ url: string }>("/billing/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        plan: params?.plan ?? "pro",
        billingPeriod: params?.billingPeriod ?? "monthly",
        stripeTrialDays: params?.stripeTrialDays ?? 14,
      }),
    });
  },

  /** Set extra user slots (Starter: 0–2, Pro: 0–3). $5/mo per slot. Owner only. */
  updateExtraUserSlots: async (quantity: number): Promise<{ extraUserSlots: number }> => {
    return apiRequest<{ extraUserSlots: number }>("/billing/extra-user", {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
  },
};
