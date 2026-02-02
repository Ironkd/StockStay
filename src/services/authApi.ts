import { apiRequest } from "../config/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  streetAddress?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  phone?: string;
  teamId?: string | null;
  teamName?: string | null;
  teamRole?: "owner" | "member" | "viewer";
  maxInventoryItems?: number | null;
  allowedPages?: string[] | null;
  allowedPropertyIds?: string[] | null;
}

export interface ProfileUpdatePayload {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  streetAddress?: string;
  city?: string;
  province?: string;
  postalCode?: string;
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
  inviteToken?: string;
}

export interface SignupResponse {
  message: string;
  checkoutUrl?: string;
  joinedTeam?: boolean;
  teamName?: string;
}

export interface SignupCheckoutPayload {
  email: string;
  password: string;
  fullName: string;
  address?: string;
  phoneNumber?: string;
  /** "starter" | "pro" – which plan to start (14-day trial for that plan). Default "pro". */
  plan?: "starter" | "pro";
}

export interface SignupCheckoutResponse {
  checkoutUrl: string;
}

export interface SignupCompletePayload {
  pendingToken: string;
  sessionId: string;
}

export interface SignupCompleteResponse {
  message: string;
}

export const authApi = {
  signup: async (payload: SignupPayload): Promise<SignupResponse> => {
    const response = await apiRequest<SignupResponse>("/auth/signup", {
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

  updateProfile: async (payload: ProfileUpdatePayload): Promise<AuthUser> => {
    return apiRequest<AuthUser>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
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
  },

  signupCheckout: async (payload: SignupCheckoutPayload): Promise<SignupCheckoutResponse> => {
    return apiRequest<SignupCheckoutResponse>("/auth/signup/checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  signupComplete: async (payload: SignupCompletePayload): Promise<SignupCompleteResponse> => {
    return apiRequest<SignupCompleteResponse>("/auth/signup/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
