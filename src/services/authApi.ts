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

export interface SignupPayload {
  email: string;
  password: string;
  fullName: string;
  address?: string;
  phoneNumber?: string;
  startProTrial?: boolean;
}

export const authApi = {
  signup: async (payload: SignupPayload): Promise<{ message: string }> => {
    const response = await apiRequest<{ message: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response;
  },

  verifyEmail: async (token: string): Promise<{ message: string }> => {
    const response = await apiRequest<{ message: string }>(
      `/auth/verify-email?token=${encodeURIComponent(token)}`
    );
    return response;
  },

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
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  },

  resetPassword: async (token: string, password: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password })
    });
  }
};
