import { apiRequest } from "../config/api";
import type { TeamData, TeamInvitationInfo, TeamMemberInfo, InvoiceStyle } from "../types";

export const teamApi = {
  getTeam: async (): Promise<TeamData> => {
    return apiRequest<TeamData>("/team");
  },

  /** Team warehouse limit (no settings access required – use from Inventory page) */
  getTeamLimits: async (): Promise<{ effectiveMaxWarehouses: number; effectivePlan: string }> => {
    return apiRequest<{ effectiveMaxWarehouses: number; effectivePlan: string }>("/team/limits");
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

  /** Update invoice email style and logo (owner only). */
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

  acceptInvitation: async (token: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>("/team/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  createInvitation: async (params: {
    email: string;
    teamRole?: string;
    allowedPages?: string[] | null;
    allowedWarehouseIds?: string[] | null;
    maxInventoryItems?: number | null;
  }): Promise<TeamInvitationInfo> => {
    return apiRequest<TeamInvitationInfo>("/team/invitations", {
      method: "POST",
      body: JSON.stringify({
        email: params.email,
        teamRole: params.teamRole || "member",
        allowedPages: params.allowedPages ?? null,
        allowedWarehouseIds: params.allowedWarehouseIds ?? null,
        maxInventoryItems: params.maxInventoryItems ?? null,
      }),
    });
  },

  updateInvitation: async (
    invitationId: string,
    params: {
      teamRole?: string;
      allowedPages?: string[] | null;
      allowedWarehouseIds?: string[] | null;
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
      allowedWarehouseIds?: string[] | null;
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
};
