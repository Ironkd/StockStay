import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingPeriod, setBillingPeriod] = React.useState<'monthly' | 'annual'>('monthly');

  // If user is already logged in, redirect to dashboard
  React.useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const handleGetStarted = () => {
    navigate("/login?mode=signup");
  };

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-container">
          <nav className="landing-nav">
            <div className="landing-logo">
              <img src="/logo.png" alt="Stock Stay" className="logo-img" />
              <span className="logo-text"><span className="brand-stock">Stock</span><span className="brand-stay">Stay</span></span>
            </div>
            <div className="landing-nav-links">
              <button onClick={() => navigate("/login")} className="nav-button secondary">
                Sign In
              </button>
              <button onClick={handleGetStarted} className="nav-button primary">
                Get Started
              </button>
            </div>
          </nav>

          <div className="hero-content">
            <h1 className="hero-title">
              Why Stock Stay?
            </h1>
            <p className="hero-domain">stockstay.com</p>
            <p className="hero-subtitle hero-lead">
              One place for inventory, invoices, and sales — so you spend less time switching apps and more time running your business. Start free, add warehouses and team members as you grow, and only pay for what you need. No credit card required.
            </p>
            <div className="hero-cta">
              <button onClick={handleGetStarted} className="cta-button primary">
                Start Free Trial
              </button>
              <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="cta-button secondary">
                See What It Does
              </button>
            </div>
            <p className="hero-note">No credit card required. Free plan available</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-features">
        <div className="landing-container">
          <h2 className="section-title">What Stock Stay Does</h2>
          <p className="section-subtitle">
            One app for inventory, warehouses, clients, invoices, sales, and your team
          </p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📦</div>
              <h3>Inventory & Warehouses</h3>
              <p>
                Track products and quantities across multiple warehouses. Organize with categories,
                search and filter, and see low-stock alerts. Free plan includes one warehouse; Starter and Pro add more.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🔄</div>
              <h3>Transfers & Shopping List</h3>
              <p>
                Move stock between warehouses in one place. A shopping list is built from low-stock items
                so you know what to reorder at a glance.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">👤</div>
              <h3>Clients</h3>
              <p>
                Store client details — name, email, phone, address. Keep contacts in one place
                and link them to invoices and sales. Data stays private to your team.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📄</div>
              <h3>Invoices</h3>
              <p>
                Create and manage invoices, link them to clients and sales. Export to PDF and CSV.
                Available on Starter and Pro plans.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">💰</div>
              <h3>Sales</h3>
              <p>
                Record sales and track what’s sold. Connect sales to clients and invoices
                so inventory, billing, and history stay in sync.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h3>Team & Permissions</h3>
              <p>
                Invite team members and set roles: owner, member, or viewer. Control who can see which pages
                and warehouses. Manage invitations and billing from Settings (Pro).
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">⚙️</div>
              <h3>Profile & Billing</h3>
              <p>
                Update your profile — first and last name, email, street, city, province, postal code, phone.
                Manage your plan, start trials, and use the Stripe customer portal for subscriptions.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Plans & Data</h3>
              <p>
                Free: 1 warehouse. Starter: more warehouses, invoices, exports. Pro: more warehouses,
                team members, granular permissions, trials. Your data is isolated per team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="landing-pricing">
        <div className="landing-container">
          <h2 className="section-title">Simple, Transparent Pricing</h2>
          <p className="section-subtitle">
            Start free, upgrade when you need more
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
              </ul>
              <button onClick={handleGetStarted} className="pricing-button">
                Get Started Free
              </button>
            </div>

            {/* Starter Plan */}
            <div className="pricing-card featured">
              <div className="pricing-badge">⭐ Most Popular</div>
              <div className="pricing-header">
                <h3>Starter</h3>
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
                  <div className="annual-savings">Save $36, 2 months free</div>
                )}
              </div>
              <ul className="pricing-features">
                <li>✓ Up to 3 warehouses</li>
                <li>✓ PDF & CSV exports</li>
                <li>✓ Invoices</li>
                <li>✓ Inventory history</li>
                <li>✓ Everything in Free</li>
              </ul>
              <button onClick={handleGetStarted} className="pricing-button primary">
                Start Starter Plan
              </button>
            </div>

            {/* Pro Plan */}
            <div className="pricing-card">
              <div className="pricing-header">
                <div className="plan-icon">🔥</div>
                <h3>Pro</h3>
                <p style={{ color: '#10b981', fontWeight: '600', fontSize: '14px', margin: '0 0 12px 0' }}>
                  🎁 Free 14 day trial
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
                  <div className="annual-savings">Save $78, 2 months free</div>
                )}
              </div>
              <ul className="pricing-features">
                <li>✓ Up to 10 warehouses</li>
                <li>✓ Team members</li>
                <li>✓ Warehouse permissions</li>
                <li>✓ Advanced reports</li>
                <li>✓ Inventory value tracking</li>
                <li>✓ Everything in Starter</li>
              </ul>
              <button onClick={handleGetStarted} className="pricing-button">
                Start Free Trial
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <div className="landing-container">
          <h2 className="cta-title">Ready to Get Started?</h2>
          <p className="cta-subtitle">
            Manage inventory, warehouses, clients, invoices, and sales in one place. Start free at stockstay.com
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
              <span className="logo-text"><span className="brand-stock">Stock</span><span className="brand-stay">Stay</span></span>
            </div>
            <div className="footer-links">
              <a href="#features">Features</a>
              <Link to="/pricing">Pricing</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/login">Sign In</Link>
            </div>
          </div>
          <div className="footer-copyright">
            <p>© 2026 Stock Stay stockstay.com</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
