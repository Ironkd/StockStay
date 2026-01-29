import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Logical key for the page, used for access control.
   * Examples: "home", "inventory", "clients", "invoices", "sales", "settings".
   */
  pageKey?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  pageKey
}) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh"
        }}
      >
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Home is always allowed, and owners / unrestricted users can see everything
  const hasPageAccess = () => {
    if (!pageKey || pageKey === "home") return true;
    if (!user) return false;
    if (!user.allowedPages || user.teamRole === "owner") return true;
    return user.allowedPages.includes(pageKey);
  };

  if (!hasPageAccess()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
