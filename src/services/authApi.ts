import { apiRequest } from "../config/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  teamId?: string | null;
  teamRole?: "owner" | "member" | "viewer";
  maxInventoryItems?: number | null;
  allowedPages?: string[] | null;
  allowedWarehouseIds?: string[] | null;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    // Store token in sessionStorage (not localStorage)
    if (response.token) {
      sessionStorage.setItem("auth_token", response.token);
    }

    return response;
  },

  logout: async (): Promise<void> => {
    try {
      await apiRequest<void>("/auth/logout", {
        method: "POST"
      });
    } catch (error) {
      // Ignore errors on logout
      console.error("Logout error:", error);
    } finally {
      sessionStorage.removeItem("auth_token");
    }
  },

  getCurrentUser: async (): Promise<AuthUser> => {
    return apiRequest<AuthUser>("/auth/me");
  },

  refreshToken: async (): Promise<{ token: string }> => {
    const response = await apiRequest<{ token: string }>("/auth/refresh", {
      method: "POST"
    });

    if (response.token) {
      sessionStorage.setItem("auth_token", response.token);
    }

    return response;
  }
};
