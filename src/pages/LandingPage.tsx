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

  const handleBookDemo = () => {
    setSupportOpen(true);
    setSupportForm((f) => ({ ...f, message: "I'd like to book a demo." }));
  };

  const scrollTo = (id: string) => () => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
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
              <button onClick={scrollTo("how-it-works")} className="nav-button ghost">
                How it works
              </button>
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
              Inventory & owner billing for short-term rental managers
            </h1>
            <p className="hero-subtitle hero-lead">
              Track supplies per property, automate owner reimbursement, and cut disputes. Less waste, less admin, more time for your portfolio.
            </p>
            <div className="hero-cta">
              <button onClick={handleBookDemo} className="cta-button primary">
                Book a demo
              </button>
              <button onClick={scrollTo("owner-billing")} className="cta-button secondary">
                See how owner billing works
              </button>
            </div>
            <p className="hero-note">No credit card for demo. Free plan available.</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="landing-section">
        <div className="landing-container">
          <h2 className="section-title">How it works</h2>
          <p className="section-subtitle">Set up in minutes, scale across your portfolio</p>
          <div className="steps-grid">
            <div className="step-card">
              <span className="step-num">1</span>
              <h3>Add properties & supplies</h3>
              <p>Create a property (or unit) for each listing. Add consumables—toiletries, paper products, coffee pods, linens, cleaning supplies—with reorder points.</p>
            </div>
            <div className="step-card">
              <span className="step-num">2</span>
              <h3>Log usage at turnover</h3>
              <p>Cleaners or ops log what was used or replaced per stay. Stock levels update by property so you always know what to restock.</p>
            </div>
            <div className="step-card">
              <span className="step-num">3</span>
              <h3>Bill owners with one click</h3>
              <p>Generate itemized owner statements from actual usage. Export or send for reimbursement—no spreadsheets, no disputes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Built for turnover operations */}
      <section id="turnover-ops" className="landing-section landing-section-alt">
        <div className="landing-container">
          <h2 className="section-title">Built for turnover operations</h2>
          <p className="section-subtitle">Cleaners and ops teams log usage; you keep control</p>
          <ul className="benefit-list">
            <li>Log consumables used per property at each turnover</li>
            <li>Low-stock alerts and reorder points so nothing runs out</li>
            <li>Shopping list built from low stock across all properties</li>
            <li>Move stock between storage and properties when needed</li>
            <li>Team permissions so cleaners see only the properties they service</li>
          </ul>
        </div>
      </section>

      {/* Owner billing made easy */}
      <section id="owner-billing" className="landing-section">
        <div className="landing-container">
          <h2 className="section-title">Owner billing made easy</h2>
          <p className="section-subtitle">Transparent, itemized, dispute-proof</p>
          <ul className="benefit-list">
            <li>Full audit trail: what was used, when, and at which property</li>
            <li>Itemized charges per property for reimbursements</li>
            <li>Export to PDF or CSV for owner statements and accounting</li>
            <li>Clear breakdowns so owners understand every line item</li>
          </ul>
        </div>
      </section>

      {/* Works across multiple properties */}
      <section id="multi-property" className="landing-section landing-section-alt">
        <div className="landing-container">
          <h2 className="section-title">Works across multiple properties</h2>
          <p className="section-subtitle">One dashboard, many units</p>
          <ul className="benefit-list">
            <li>Low-stock alerts per property so you restock the right unit</li>
            <li>Reorder points and par levels by supply and property</li>
            <li>See which properties use the most of what—optimize ordering</li>
            <li>Scale from a few units to hundreds without changing tools</li>
          </ul>
        </div>
      </section>

      {/* Why not spreadsheets? */}
      <section id="why-not-spreadsheets" className="landing-section">
        <div className="landing-container">
          <h2 className="section-title">Why not spreadsheets?</h2>
          <p className="section-subtitle">They don’t scale—and they cost you money</p>
          <ul className="benefit-list">
            <li><strong>Scaling pain:</strong> Multiple tabs, copy-paste errors, no single source of truth</li>
            <li><strong>Missed charges:</strong> Easy to forget line items or properties when billing owners</li>
            <li><strong>Disputes:</strong> “What was this charge?”—spreadsheets rarely have a clear audit trail</li>
            <li><strong>Time:</strong> Manual updates and reconciliation eat hours every month</li>
          </ul>
        </div>
      </section>

      {/* STR use-case block */}
      <section id="use-cases" className="landing-section landing-section-alt">
        <div className="landing-container">
          <h2 className="section-title">Track what matters at turnover</h2>
          <p className="section-subtitle">Allocate and bill back by property</p>
          <div className="use-case-grid">
            <div className="use-case-item">Toiletries (shampoo, soap, conditioner)</div>
            <div className="use-case-item">Paper products (tissue, paper towels)</div>
            <div className="use-case-item">Coffee pods & kitchen consumables</div>
            <div className="use-case-item">Linens & towel replacement</div>
            <div className="use-case-item">Cleaning supplies</div>
          </div>
          <p className="use-case-close">
            Every charge can be allocated per property and billed back to owners—with an audit trail that keeps everyone aligned.
          </p>
        </div>
      </section>

      {/* Who it's for */}
      <section id="who-its-for" className="landing-section">
        <div className="landing-container">
          <h2 className="section-title">Who it’s for</h2>
          <p className="section-subtitle">Built for short-term and vacation rental operations</p>
          <div className="who-grid">
            <div className="who-card who-for">
              <h3>For</h3>
              <ul>
                <li>STR managers (5–500 units)</li>
                <li>Vacation rental companies</li>
                <li>Co-hosting teams and property managers</li>
              </ul>
            </div>
            <div className="who-card who-not">
              <h3>Not for</h3>
              <p>Retail warehouses or traditional inventory / SKU management.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="landing-pricing">
        <div className="landing-container">
          <h2 className="section-title">Simple, Transparent Pricing</h2>
          <p className="section-subtitle">
            Simple pricing for property managers. Start free, add properties and team as you grow.
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
                <li>✓ 1 property</li>
                <li>✓ Unlimited supplies</li>
                <li>✓ Basic supply tracking</li>
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
                <li>✓ Up to 3 properties</li>
                <li>✓ PDF & CSV exports</li>
                <li>✓ Owner statements / invoices</li>
                <li>✓ Usage history</li>
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
                <li>✓ Up to 10 properties</li>
                <li>✓ Team members</li>
                <li>✓ Property-level permissions</li>
                <li>✓ Shopping list from low stock</li>
                <li>✓ Advanced reports</li>
                <li>✓ Supply value tracking</li>
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
          <h2 className="cta-title">Ready to simplify supply tracking and owner billing?</h2>
          <p className="cta-subtitle">
            Join short-term rental managers who track per property and bill with confidence.
          </p>
          <div className="cta-buttons">
            <button onClick={handleBookDemo} className="cta-button large primary">
              Book a demo
            </button>
            <button onClick={handleGetStarted} className="cta-button large secondary">
              Start your free trial
            </button>
          </div>
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
              <a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollTo("how-it-works")(); }}>How it works</a>
              <a href="#owner-billing" onClick={(e) => { e.preventDefault(); scrollTo("owner-billing")(); }}>Owner billing</a>
              <a href="#pricing" onClick={(e) => { e.preventDefault(); scrollTo("pricing")(); }}>Pricing</a>
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
