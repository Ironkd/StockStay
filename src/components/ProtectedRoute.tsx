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

  // Home is always allowed; owners see everything; invited members only see pages the owner picked
  const hasPageAccess = () => {
    if (!pageKey || pageKey === "home") return true;
    if (!user) return false;
    if (user.teamRole === "owner") return true;
    if (!user.allowedPages || user.allowedPages.length === 0) return false;
    return user.allowedPages.includes(pageKey);
  };

  if (!hasPageAccess()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
