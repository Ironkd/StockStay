import { apiRequest } from "../config/api";
import type { TeamData, TeamInvitationInfo } from "../types";

export const teamApi = {
  getTeam: async (): Promise<TeamData> => {
    return apiRequest<TeamData>("/team");
  },

  updateTeamName: async (name: string): Promise<{ team: { id: string; name: string } }> => {
    return apiRequest<{ team: { id: string; name: string } }>("/team", {
      method: "PATCH",
      body: JSON.stringify({ name }),
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
  }): Promise<TeamInvitationInfo> => {
    return apiRequest<TeamInvitationInfo>("/team/invitations", {
      method: "POST",
      body: JSON.stringify({ email: params.email, teamRole: params.teamRole || "member" }),
    });
  },

  revokeInvitation: async (invitationId: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/team/invitations/${invitationId}`, {
      method: "DELETE",
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
