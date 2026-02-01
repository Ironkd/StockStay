import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { teamApi } from "../services/teamApi";

/**
 * Renders children only when the team's effective plan is Pro (paid or trial).
 * Otherwise redirects to dashboard. Use for Pro-only features like Shopping List.
 */
export const ProOnlyRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [effectivePlan, setEffectivePlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teamApi
      .getTeamLimits()
      .then((r) => setEffectivePlan(r.effectivePlan))
      .catch(() => setEffectivePlan("free"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "50vh",
        }}
      >
        <div>Loading...</div>
      </div>
    );
  }

  if (effectivePlan !== "pro") {
    return <Navigate to="/dashboard?upgrade=shopping-list" replace />;
  }

  return <>{children}</>;
};
