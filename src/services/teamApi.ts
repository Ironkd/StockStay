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
  };
  members: TeamMember[];
  invitations: TeamInvitation[];
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
  }
};

