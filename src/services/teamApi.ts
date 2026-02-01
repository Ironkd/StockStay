import { apiRequest } from "../config/api";

export const teamApi = {
  acceptInvitation: async (token: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>("/team/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },
};
