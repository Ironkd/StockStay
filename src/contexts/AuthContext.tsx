import React, { useState, useEffect } from "react";
import { authApi } from "../services/authApi";
import { invalidateApiCache } from "../config/api";
import { AuthContext } from "./authContextInstance";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [user, setUser] = useState<import("../services/authApi").AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = sessionStorage.getItem("auth_token");
        if (token) {
          const currentUser = await authApi.getCurrentUser();
          setUser(currentUser);
        }
      } catch {
        sessionStorage.removeItem("auth_token");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    const onSessionExpired = () => {
      setUser(null);
    };
    window.addEventListener("session-expired", onSessionExpired);
    return () => window.removeEventListener("session-expired", onSessionExpired);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    const response = await authApi.login(email, password);
    invalidateApiCache();
    setUser(response.user);
    return true;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      invalidateApiCache();
      setUser(null);
    }
  };

  const updateUser = (updates: Partial<import("../services/authApi").AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const refreshUser = async () => {
    const token = sessionStorage.getItem("auth_token");
    if (!token) return;
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
    } catch {
      sessionStorage.removeItem("auth_token");
      invalidateApiCache();
      setUser(null);
    }
  };

  const switchTeam = async (teamId: string) => {
    const updated = await authApi.switchActiveTeam(teamId);
    invalidateApiCache();
    setUser(updated);
    window.dispatchEvent(new Event("active-team-changed"));
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const token = sessionStorage.getItem("auth_token");
      if (!token) return;
      authApi
        .getCurrentUser()
        .then(setUser)
        .catch(() => {
          sessionStorage.removeItem("auth_token");
          invalidateApiCache();
          setUser(null);
        });
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
        loading,
        canWrite: Boolean(user && user.teamRole !== "viewer"),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
