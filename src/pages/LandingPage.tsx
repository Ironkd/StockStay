import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest } from "../config/api";

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingPeriod, setBillingPeriod] = React.useState<'monthly' | 'annual'>('monthly');
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [supportForm, setSupportForm] = React.useState({ name: "", email: "", message: "" });
  const [supportSending, setSupportSending] = React.useState(false);
  const [supportResult, setSupportResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  // If user is already logged in, redirect to dashboard
  React.useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const handleGetStarted = () => {
    navigate("/login?mode=signup");
  };

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupportResult(null);
    setSupportSending(true);
    try {
      await apiRequest<{ message: string }>("/contact", {
        method: "POST",
        body: JSON.stringify({
          name: supportForm.name.trim(),
          email: supportForm.email.trim(),
          message: supportForm.message.trim(),
        }),
      });
      setSupportResult({ ok: true, message: "Message sent. We'll get back to you soon." });
      setSupportForm({ name: "", email: "", message: "" });
      setTimeout(() => {
        setSupportOpen(false);
        setSupportResult(null);
      }, 2000);
    } catch (err) {
      setSupportResult({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to send. Please try again.",
      });
    } finally {
      setSupportSending(false);
    }
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
            <p className="hero-subtitle hero-lead">
              One place for inventory, invoices, and turnover — so you spend less time switching apps and more time running your short-term rentals. Start free, add properties and team members as you grow, and only pay for what you need. No credit card required.
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

          {/* Coming Soon */}
          <div className="coming-soon-block">
            <span className="coming-soon-badge">Coming Soon</span>
            <div className="coming-soon-items">
              <div className="coming-soon-item">
                <h3 className="coming-soon-title">Integration with Airbnb & VRBO for cleaning scheduling</h3>
                <p className="coming-soon-text">
                  Sync your stays with Stock Stay and schedule cleanings automatically. One place for inventory, turnovers, and your short-term rental workflow.
                </p>
              </div>
              <div className="coming-soon-item">
                <h3 className="coming-soon-title">Snap a receipt or scan a barcode — straight into your inventory</h3>
                <p className="coming-soon-text">
                  Take a photo of a receipt or scan product barcodes and we’ll add items to your inventory for you. Less typing, faster restocking.
                </p>
              </div>
              <div className="coming-soon-item">
                <h3 className="coming-soon-title">Invoices linked to QuickBooks</h3>
                <p className="coming-soon-text">
                  Send your Stock Stay invoices straight to QuickBooks. Keep your books in sync without re-entering data or switching apps.
                </p>
              </div>
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
                <li>✓ Shopping list from low stock</li>
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
              <a
                href="#"
                className="footer-support-link"
                onClick={(e) => {
                  e.preventDefault();
                  setSupportOpen(true);
                }}
              >
                Support
              </a>
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

      {/* Support modal */}
      {supportOpen && (
        <div
          className="support-modal-overlay"
          onClick={() => !supportSending && setSupportOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px",
          }}
        >
          <div
            className="support-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              maxWidth: "440px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem" }}>Contact Support</h3>
              <button
                type="button"
                onClick={() => !supportSending && setSupportOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.25rem",
                  cursor: supportSending ? "not-allowed" : "pointer",
                  color: "#64748b",
                  padding: "4px",
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: "0.9rem", color: "#64748b" }}>
              Send us a message and we'll get back to you at support@stockstay.com.
            </p>
            {supportResult && (
              <p
                style={{
                  margin: "0 0 16px",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  backgroundColor: supportResult.ok ? "#dcfce7" : "#fee2e2",
                  color: supportResult.ok ? "#166534" : "#b91c1c",
                }}
              >
                {supportResult.message}
              </p>
            )}
            <form onSubmit={handleSupportSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Name</span>
                <input
                  type="text"
                  value={supportForm.name}
                  onChange={(e) => setSupportForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Your name"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Email *</span>
                <input
                  type="email"
                  required
                  value={supportForm.email}
                  onChange={(e) => setSupportForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>What are you looking for? *</span>
                <textarea
                  required
                  value={supportForm.message}
                  onChange={(e) => setSupportForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Describe your question or issue..."
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "14px",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => !supportSending && setSupportOpen(false)}
                  className="nav-button secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="nav-button primary" disabled={supportSending}>
                  {supportSending ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
