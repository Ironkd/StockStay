import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { teamApi } from "../services/teamApi";

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [teamPlan, setTeamPlan] = useState<string | null>(null);
  const [billingPortalAvailable, setBillingPortalAvailable] = useState(false);
  const [proButtonLoading, setProButtonLoading] = useState(false);
  const [starterButtonLoading, setStarterButtonLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setTeamPlan(null);
      setBillingPortalAvailable(false);
      return;
    }
    teamApi.getTeam().then((r) => {
      setTeamPlan(r.team.effectivePlan ?? r.team.plan ?? "free");
      setBillingPortalAvailable(r.team.billingPortalAvailable ?? false);
    }).catch(() => {
      setTeamPlan("free");
      setBillingPortalAvailable(false);
    });
  }, [user?.id]);

  const isOwner = user?.teamRole === "owner";

  const handleGetStarted = () => {
    if (user) {
      navigate("/settings");
    } else {
      navigate("/login?mode=signup");
    }
  };

  const handleProAction = async () => {
    if (!user) {
      navigate("/login?mode=signup");
      return;
    }
    if (!isOwner) {
      navigate("/settings");
      return;
    }
    if (teamPlan === "pro" && billingPortalAvailable) {
      setProButtonLoading(true);
      try {
        const { url } = await teamApi.createCustomerPortalSession();
        if (url) window.location.href = url;
      } finally {
        setProButtonLoading(false);
      }
      return;
    }
    if (teamPlan === "pro") {
      navigate("/settings");
      return;
    }
    setProButtonLoading(true);
    try {
      const { url } = await teamApi.createCheckoutSession({
        plan: "pro",
        billingPeriod,
      });
      if (url) window.location.href = url;
      else navigate("/settings");
    } catch {
      navigate("/settings");
    } finally {
      setProButtonLoading(false);
    }
  };

  const handleStarterAction = async () => {
    if (!user) {
      navigate("/login?mode=signup");
      return;
    }
    if (!isOwner) {
      navigate("/settings");
      return;
    }
    if (teamPlan === "starter" && billingPortalAvailable) {
      setStarterButtonLoading(true);
      try {
        const { url } = await teamApi.createCustomerPortalSession();
        if (url) window.location.href = url;
      } finally {
        setStarterButtonLoading(false);
      }
      return;
    }
    if (teamPlan === "starter") {
      navigate("/settings");
      return;
    }
    setStarterButtonLoading(true);
    try {
      const { url } = await teamApi.createCheckoutSession({
        plan: "starter",
        billingPeriod,
      });
      if (url) window.location.href = url;
      else navigate("/settings");
    } catch {
      navigate("/settings");
    } finally {
      setStarterButtonLoading(false);
    }
  };

  return (
    <div className="landing-page">
      {/* Navigation */}
      <section className="landing-hero" style={{ paddingBottom: '40px' }}>
        <div className="landing-container">
          <nav className="landing-nav">
            <Link to="/" className="landing-logo">
              <img src="/logo.png" alt="Stock Stay" className="logo-img" />
              <span className="logo-text">
                <span className="brand-stock">Stock</span>
                <span className="brand-stay">Stay</span>
              </span>
            </Link>
            <div className="landing-nav-links">
              {user ? (
                <button onClick={() => navigate("/dashboard")} className="nav-button primary">
                  Go to Dashboard
                </button>
              ) : (
                <>
                  <button onClick={() => navigate("/login")} className="nav-button secondary">
                    Sign In
                  </button>
                  <button onClick={handleGetStarted} className="nav-button primary">
                    Get Started
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="landing-pricing">
        <div className="landing-container">
          <h2 className="section-title">Simple, Transparent Pricing</h2>
          <p className="section-subtitle">
            Choose the plan that fits your business. All plans include core inventory management features.
          </p>

          {/* Billing Toggle */}
          <div className="billing-toggle">
            <button 
              className={`billing-option ${billingPeriod === 'monthly' ? 'active' : ''}`}
              onClick={() => setBillingPeriod('monthly')}
            >
              Monthly
            </button>
            <button 
              className={`billing-option ${billingPeriod === 'annual' ? 'active' : ''}`}
              onClick={() => setBillingPeriod('annual')}
            >
              Annual <span className="savings-badge">Save 17%</span>
            </button>
          </div>

          <div className="pricing-grid">
            {/* Free Plan */}
            <div className="pricing-card">
              <div className="pricing-header">
                <div className="plan-icon">🆓</div>
                <h3>Free</h3>
                <div className="pricing-price">
                  <span className="price-amount">$0</span>
                  <span className="price-period"> forever</span>
                </div>
              </div>
              <ul className="pricing-features">
                <li>✓ 1 warehouse</li>
                <li>✓ Unlimited products</li>
                <li>✓ Basic inventory tracking</li>
                <li>✓ Client management</li>
                <li>✓ Basic reports</li>
              </ul>
              <button onClick={handleGetStarted} className="pricing-button">
                Get Started Free
              </button>
              <p style={{ textAlign: 'center', marginTop: '16px', color: '#64748b', fontSize: '14px' }}>
                No credit card required
              </p>
            </div>

            {/* Starter Plan */}
            <div className="pricing-card featured">
              <div className="pricing-badge">⭐ Most Popular</div>
              <div className="pricing-header">
                <h3>Starter</h3>
                <p style={{ color: '#10b981', fontWeight: '600', fontSize: '14px', margin: '0 0 12px 0' }}>
                  🎁 14-day free trial, then billed
                </p>
                <div className="pricing-price">
                  {billingPeriod === 'monthly' ? (
                    <>
                      <span className="price-amount">$18</span>
                      <span className="price-period"> / month</span>
                    </>
                  ) : (
                    <>
                      <span className="price-amount">$180</span>
                      <span className="price-period"> / year</span>
                    </>
                  )}
                </div>
                {billingPeriod === 'annual' && (
                  <div className="annual-savings">Save $36 — 2 months free</div>
                )}
              </div>
              <ul className="pricing-features">
                <li>✓ Up to 3 warehouses</li>
                <li>✓ PDF & CSV exports</li>
                <li>✓ Invoices</li>
                <li>✓ Inventory history</li>
                <li>✓ Email support</li>
                <li>✓ Everything in Free</li>
              </ul>
              {user && isOwner && teamPlan === "starter" && !billingPortalAvailable ? (
                <button onClick={() => navigate("/settings")} className="pricing-button primary">
                  Current plan
                </button>
              ) : user && isOwner && teamPlan === "starter" && billingPortalAvailable ? (
                <button onClick={handleStarterAction} className="pricing-button primary" disabled={starterButtonLoading}>
                  {starterButtonLoading ? "Loading…" : "Manage subscription"}
                </button>
              ) : user && isOwner && teamPlan !== "starter" ? (
                <button onClick={handleStarterAction} className="pricing-button primary" disabled={starterButtonLoading}>
                  {starterButtonLoading ? "Loading…" : "Start Free Trial"}
                </button>
              ) : (
                <button onClick={handleGetStarted} className="pricing-button primary">
                  Start Free Trial
                </button>
              )}
              <p style={{ textAlign: 'center', marginTop: '16px', color: '#64748b', fontSize: '14px' }}>
                14-day free trial, then {billingPeriod === 'monthly' ? 'billed monthly' : 'billed annually'}
              </p>
            </div>

            {/* Pro Plan */}
            <div className="pricing-card">
              <div className="pricing-header">
                <div className="plan-icon">🔥</div>
                <h3>Pro</h3>
                <p style={{ color: '#10b981', fontWeight: '600', fontSize: '14px', margin: '0 0 12px 0' }}>
                  🎁 14-day free trial, then billed
                </p>
                <div className="pricing-price">
                  {billingPeriod === 'monthly' ? (
                    <>
                      <span className="price-amount">$39</span>
                      <span className="price-period"> / month</span>
                    </>
                  ) : (
                    <>
                      <span className="price-amount">$390</span>
                      <span className="price-period"> / year</span>
                    </>
                  )}
                </div>
                {billingPeriod === 'annual' && (
                  <div className="annual-savings">Save $78 — 2 months free</div>
                )}
              </div>
              <ul className="pricing-features">
                <li>✓ Up to 10 warehouses</li>
                <li>✓ Team members</li>
                <li>✓ Warehouse permissions</li>
                <li>✓ Advanced reports</li>
                <li>✓ Inventory value tracking</li>
                <li>✓ Priority support</li>
                <li>✓ Everything in Starter</li>
              </ul>
              {user && isOwner && teamPlan === "pro" && !billingPortalAvailable ? (
                <button onClick={() => navigate("/settings")} className="pricing-button">
                  Current plan
                </button>
              ) : user && isOwner && teamPlan === "pro" && billingPortalAvailable ? (
                <button onClick={handleProAction} className="pricing-button" disabled={proButtonLoading}>
                  {proButtonLoading ? "Loading…" : "Manage subscription"}
                </button>
              ) : user && isOwner && teamPlan !== "pro" ? (
                <button onClick={handleProAction} className="pricing-button" disabled={proButtonLoading}>
                  {proButtonLoading ? "Loading…" : "Start Free Trial"}
                </button>
              ) : (
                <button onClick={handleGetStarted} className="pricing-button">
                  Start Free Trial
                </button>
              )}
              <p style={{ textAlign: 'center', marginTop: '16px', color: '#64748b', fontSize: '14px' }}>
                {user && isOwner && teamPlan === "pro"
                  ? "Manage your subscription in Settings or above."
                  : "14-day free trial, then billed monthly or annually"}
              </p>
            </div>
          </div>

          {/* FAQ or Additional Info */}
          <div style={{ maxWidth: '800px', margin: '80px auto 0', textAlign: 'center' }}>
            <h3 style={{ fontSize: '28px', marginBottom: '16px' }}>Frequently Asked Questions</h3>
            
            <div style={{ textAlign: 'left', marginTop: '40px' }}>
              <div style={{ marginBottom: '32px' }}>
                <h4 style={{ fontSize: '18px', marginBottom: '8px', color: '#0f172a' }}>
                  Can I switch plans at any time?
                </h4>
                <p style={{ color: '#64748b', lineHeight: '1.6' }}>
                  Yes! You can upgrade or downgrade your plan at any time. When upgrading, you'll be charged 
                  the prorated difference. When downgrading, the change takes effect at the end of your 
                  current billing period.
                </p>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <h4 style={{ fontSize: '18px', marginBottom: '8px', color: '#0f172a' }}>
                  What happens if I exceed my warehouse limit?
                </h4>
                <p style={{ color: '#64748b', lineHeight: '1.6' }}>
                  You'll be prompted to upgrade to a higher plan. Your existing data remains safe and 
                  accessible—you just won't be able to add new warehouses until you upgrade.
                </p>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <h4 style={{ fontSize: '18px', marginBottom: '8px', color: '#0f172a' }}>
                  Do you offer refunds?
                </h4>
                <p style={{ color: '#64748b', lineHeight: '1.6' }}>
                  Yes! If you're not satisfied within the first 30 days, we'll give you a full refund, 
                  no questions asked.
                </p>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <h4 style={{ fontSize: '18px', marginBottom: '8px', color: '#0f172a' }}>
                  Is my data secure?
                </h4>
                <p style={{ color: '#64748b', lineHeight: '1.6' }}>
                  Absolutely. We use industry-standard encryption and security practices. Your data is 
                  backed up regularly and stored securely in the cloud.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <div className="landing-container">
          <h2 className="cta-title">Ready to Get Started?</h2>
          <p className="cta-subtitle">
            Join businesses managing their inventory with Stock Stay
          </p>
          <button onClick={handleGetStarted} className="cta-button large">
            Start Your Free Trial
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="footer-content">
            <div className="footer-brand">
              <img src="/logo.png" alt="Stock Stay" className="logo-img footer-logo-img" />
              <span className="logo-text">
                <span className="brand-stock">Stock</span>
                <span className="brand-stay">Stay</span>
              </span>
            </div>
            <div className="footer-links">
              <Link to="/">Home</Link>
              <a href="/#features">Features</a>
              <Link to="/pricing">Pricing</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/login">Sign In</Link>
            </div>
          </div>
          <div className="footer-copyright">
            <p>© 2026 Stock Stay · stockstay.com</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
