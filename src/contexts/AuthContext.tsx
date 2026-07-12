import React, { createContext, useContext, useState, useEffect } from "react";
import { authApi, type AuthUser } from "../services/authApi";

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
  refreshUser: () => Promise<void>;
  switchTeam: (teamId: string) => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = sessionStorage.getItem("auth_token");
        if (token) {
          const currentUser = await authApi.getCurrentUser();
          setUser(currentUser);
        }
      } catch (error) {
        sessionStorage.removeItem("auth_token");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    const response = await authApi.login(email, password);
    setUser(response.user);
    return true;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
    }
  };

  const updateUser = (updates: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const refreshUser = async () => {
    const token = sessionStorage.getItem("auth_token");
    if (!token) return;
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    }
  };

  const switchTeam = async (teamId: string) => {
    const updated = await authApi.switchActiveTeam(teamId);
    setUser(updated);
    window.dispatchEvent(new Event("active-team-changed"));
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const token = sessionStorage.getItem("auth_token");
      if (!token) return;
      authApi.getCurrentUser().then(setUser).catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        updateUser,
        refreshUser,
        switchTeam,
        isAuthenticated: !!user,
        loading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
