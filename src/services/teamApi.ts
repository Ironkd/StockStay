import { apiRequest } from "../config/api";

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  teamRole: "owner" | "member" | "viewer";
  maxInventoryItems: number | null;
   allowedPages: string[] | null;
   allowedWarehouseIds: string[] | null;
}

export interface TeamInvitation {
  id: string;
  email: string;
  teamRole: "owner" | "member" | "viewer";
  maxInventoryItems: number | null;
  status: "pending" | "accepted" | "expired" | "revoked";
  token: string;
  createdAt: string;
  expiresAt: string;
  allowedPages: string[] | null;
  allowedWarehouseIds: string[] | null;
}

export interface TeamResponse {
  team: {
    id: string;
    name: string;
    ownerId: string;
    plan?: string | null;
    maxWarehouses?: number | null;
    warehouseCount?: number;
    effectivePlan?: string;
    isOnTrial?: boolean;
    trialEndsAt?: string | null;
    trialStatus?: { daysRemaining: number; expired: boolean } | null;
    billingInterval?: string | null; // "month" | "year" from Stripe
    billingPortalAvailable?: boolean;
  };
  members: TeamMember[];
  invitations: TeamInvitation[];
}

export interface BillingCheckoutResponse {
  url: string;
}

export interface BillingPortalResponse {
  url: string;
}

export const teamApi = {
  getTeam: async (): Promise<TeamResponse> => {
    return apiRequest<TeamResponse>("/team");
  },

  createInvitation: async (params: {
    email: string;
    teamRole: "member" | "viewer";
    maxInventoryItems?: number | null;
    allowedPages?: string[] | null;
    allowedWarehouseIds?: string[] | null;
  }): Promise<TeamInvitation> => {
    return apiRequest<TeamInvitation>("/team/invitations", {
      method: "POST",
      body: JSON.stringify(params)
    });
  },

  acceptInvitation: async (token: string): Promise<{
    message: string;
    teamId: string;
    teamRole: "owner" | "member" | "viewer";
    maxInventoryItems: number | null;
  }> => {
    return apiRequest<{
      message: string;
      teamId: string;
      teamRole: "owner" | "member" | "viewer";
      maxInventoryItems: number | null;
    }>("/team/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token })
    });
  },

  updateMember: async (
    userId: string,
    params: {
      teamRole?: "member" | "viewer";
      maxInventoryItems?: number | null;
      allowedPages?: string[] | null;
      allowedWarehouseIds?: string[] | null;
    }
  ): Promise<TeamMember> => {
    return apiRequest<TeamMember>(`/team/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(params)
    });
  },

  removeMember: async (userId: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/team/members/${userId}`, {
      method: "DELETE"
    });
  },

  updateInvitation: async (
    invitationId: string,
    params: {
      teamRole?: "member" | "viewer";
      maxInventoryItems?: number | null;
      allowedPages?: string[] | null;
      allowedWarehouseIds?: string[] | null;
    }
  ): Promise<TeamInvitation> => {
    return apiRequest<TeamInvitation>(`/team/invitations/${invitationId}`, {
      method: "PATCH",
      body: JSON.stringify(params)
    });
  },

  revokeInvitation: async (invitationId: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/team/invitations/${invitationId}`, {
      method: "DELETE"
    });
  },

  /** Create Stripe Checkout session for a plan. Returns URL to redirect to. */
  createCheckoutSession: async (params?: {
    successUrl?: string;
    cancelUrl?: string;
    plan?: "pro" | "starter";
    billingPeriod?: "monthly" | "annual";
    stripeTrialDays?: number;
  }): Promise<BillingCheckoutResponse> => {
    return apiRequest<BillingCheckoutResponse>("/billing/create-checkout-session", {
      method: "POST",
      body: JSON.stringify(params ?? {})
    });
  },

  /** Create Stripe Customer Portal session (manage subscription). Returns URL to redirect to. */
  createCustomerPortalSession: async (returnUrl?: string): Promise<BillingPortalResponse> => {
    return apiRequest<BillingPortalResponse>("/billing/customer-portal", {
      method: "POST",
      body: JSON.stringify({ returnUrl })
    });
  }
};

