import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchPlansConfig } from "../services/plansApi";
import type { PlansConfig } from "../types";

function formatCap(n: number | null | undefined, unlimitedLabel = "Unlimited"): string {
  if (n == null) return unlimitedLabel;
  return String(n);
}

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<PlansConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    fetchPlansConfig()
      .then(setConfig)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load plans"));
  }, []);

  const tiers = config
    ? [config.plans.free, config.plans.starter, config.plans.pro]
    : [];

  return (
    <div className="landing-page">
      <header className="landing-hero" style={{ paddingBottom: "24px" }}>
        <div className="landing-container">
          <nav className="landing-nav">
            <Link to="/" className="landing-logo" style={{ textDecoration: "none", color: "inherit" }}>
              <img src="/logo.png" alt="Stock Stay" className="logo-img" />
              <span className="logo-text">
                <span className="brand-stock">Stock</span>
                <span className="brand-stay">Stay</span>
              </span>
            </Link>
            <div className="landing-nav-links">
              <button type="button" onClick={() => navigate("/login")} className="nav-button secondary">
                Sign In
              </button>
              <button type="button" onClick={() => navigate("/login?mode=signup")} className="nav-button primary">
                Get Started
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="legal-content">
        <div className="legal-inner">
          <h1>Pricing</h1>
          <p className="legal-updated">
            Limits below are loaded from the live product config
            {config ? ` (${config.currency})` : ""}.
          </p>

          {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

          <div className="billing-toggle" style={{ marginBottom: "24px" }}>
            <button
              type="button"
              className={`billing-option ${billingPeriod === "monthly" ? "active" : ""}`}
              onClick={() => setBillingPeriod("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`billing-option ${billingPeriod === "annual" ? "active" : ""}`}
              onClick={() => setBillingPeriod("annual")}
            >
              Annual
            </button>
          </div>

          <div className="pricing-grid">
            {tiers.map((plan) => (
              <div
                key={plan.id}
                className={`pricing-card ${plan.id === "starter" ? "featured" : ""}`}
              >
                <div className="pricing-header">
                  <h3>{plan.name}</h3>
                  <div className="pricing-price">
                    <span className="price-amount">
                      $
                      {billingPeriod === "monthly" ? plan.monthlyPrice : plan.annualPrice}
                    </span>
                    <span className="price-period">
                      {plan.monthlyPrice === 0
                        ? " forever"
                        : billingPeriod === "monthly"
                          ? " / month"
                          : " / year"}
                    </span>
                  </div>
                </div>
                <ul className="pricing-features">
                  {(plan.marketingFeatures && plan.marketingFeatures.length > 0
                    ? plan.marketingFeatures
                    : [
                        `${formatCap(plan.maxProperties)} properties`,
                        `${formatCap(plan.baseMaxUsers ?? plan.maxUsers)} users`,
                        `${formatCap(plan.maxStockLocations)} stock locations`,
                        `${formatCap(plan.maxSupplyItems)} supply items`,
                        `${formatCap(plan.maxSkus)} SKUs`,
                      ]
                  ).map((line) => (
                    <li key={line}>✓ {line}</li>
                  ))}
                </ul>
                {config && plan.id !== "free" && (plan.maxExtraUserSlots ?? 0) > 0 && (
                  <p style={{ fontSize: "13px", color: "#64748b" }}>
                    Extra users: up to {plan.maxExtraUserSlots} @ ${config.extraUserPrice}/mo each
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => navigate("/login?mode=signup")}
                  className={`pricing-button ${plan.id === "starter" ? "primary" : ""}`}
                >
                  Get started
                </button>
              </div>
            ))}
          </div>

          {!config && !error && <p>Loading plans…</p>}
        </div>
      </main>
    </div>
  );
};
