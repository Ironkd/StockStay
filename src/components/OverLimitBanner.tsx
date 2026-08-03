import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { teamApi } from "../services/teamApi";
import type { TeamLimits } from "../types";

const RESOURCE_LABELS: Record<string, string> = {
  properties: "properties",
  users: "users",
  stockLocations: "stock locations",
  supplyItems: "supply items",
  skus: "SKUs",
  inventoryItems: "inventory items",
};

type Props = {
  teamKey?: string;
};

export const OverLimitBanner: React.FC<Props> = ({ teamKey }) => {
  const [limits, setLimits] = useState<TeamLimits | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      teamApi
        .getTeamLimits()
        .then((data) => {
          if (!cancelled) setLimits(data);
        })
        .catch(() => {
          if (!cancelled) setLimits(null);
        });
    };
    load();
    const onTeamChange = () => load();
    window.addEventListener("active-team-changed", onTeamChange);
    return () => {
      cancelled = true;
      window.removeEventListener("active-team-changed", onTeamChange);
    };
  }, [teamKey]);

  if (!limits?.overLimit) return null;

  const over = Object.entries(limits.resources)
    .filter(([, u]) => u.overLimit)
    .map(([key, u]) => {
      const label = RESOURCE_LABELS[key] || key;
      return u.max != null ? `${label} (${u.used}/${u.max})` : label;
    });

  if (over.length === 0) return null;

  return (
    <div className="plan-over-limit-banner" role="status">
      <div className="plan-over-limit-banner-body">
        <strong>Over plan limit</strong>
        <span>
          Your {limits.effectivePlan} plan is over limit for {over.join(", ")}. Existing data is
          kept; you can&apos;t create more of those until you upgrade or reduce usage.
        </span>
        <Link to="/settings" className="plan-over-limit-cta">
          Upgrade in Settings
        </Link>
        <Link to="/pricing" className="plan-over-limit-cta secondary">
          View pricing
        </Link>
      </div>
    </div>
  );
};
