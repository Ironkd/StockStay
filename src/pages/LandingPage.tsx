import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { apiRequest } from "../config/api";
import { fetchPlansConfig } from "../services/plansApi";
import { Icon } from "../components/ui/Icon";
import { Modal } from "../components/ui/Modal";
import { FormField } from "../components/ui/FormField";
import { Button } from "../components/ui/Button";
import { track } from "../lib/analytics";
import type { PlansConfig } from "../types";

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingPeriod, setBillingPeriod] = React.useState<'monthly' | 'annual'>('monthly');
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [supportForm, setSupportForm] = React.useState({ name: "", email: "", message: "" });
  const [supportSending, setSupportSending] = React.useState(false);
  const [supportResult, setSupportResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [plansConfig, setPlansConfig] = React.useState<PlansConfig | null>(null);

  // If user is already logged in, redirect to dashboard
  React.useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  React.useEffect(() => {
    fetchPlansConfig()
      .then(setPlansConfig)
      .catch(() => setPlansConfig(null));
  }, []);

  const free = plansConfig?.plans.free;
  const starter = plansConfig?.plans.starter;
  const pro = plansConfig?.plans.pro;

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
      track("feedback_sent", { source: "landing" });
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
              Inventory management built for short-term rental hosts and property managers. Track supplies across your Airbnb, VRBO, and vacation rental properties in one place. Spend less time on spreadsheets and more time growing your STR business. Start free, add properties as you grow.
            </p>
            <div className="hero-cta">
              <button onClick={handleGetStarted} className="cta-button primary">
                Start Free Trial
              </button>
              <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="cta-button secondary">
                Demo
              </button>
            </div>
            <p className="hero-note">No credit card required. Free plan available</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-features">
        <div className="landing-container">
          <h2 className="section-title">Built for Short-Term Rentals</h2>
          <p className="section-subtitle">
            Everything Airbnb and VRBO hosts need to manage supplies, turnovers, and billing
          </p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon"><Icon name="stock" size={22} /></div>
              <h3>Supplies Per Property</h3>
              <p>
                Track toiletries, linens, cleaning supplies, and coffee pods for each Airbnb or vacation rental. Get low-stock alerts before turnovers so you're never caught short.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><Icon name="refresh" size={22} /></div>
              <h3>Transfers & Restocking</h3>
              <p>
                Move supplies between properties with one click. Auto-generated shopping lists from low-stock items so you know exactly what to buy before your next guest arrives.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><Icon name="user" size={22} /></div>
              <h3>Owner & Guest Contacts</h3>
              <p>
                Keep property owner and guest contact details organized. Link them to invoices for easy owner reimbursement and pass-through billing.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><Icon name="document" size={22} /></div>
              <h3>Owner Invoicing</h3>
              <p>
                Bill property owners for supplies used at their rentals. Create invoices, export to PDF, and keep billing organized across all your managed properties.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><Icon name="home" size={22} /></div>
              <h3>Turnover Tracking</h3>
              <p>
                Log what's used after each guest checkout. Track consumption per property so you know which listings use more supplies and can bill owners accurately.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><Icon name="clients" size={22} /></div>
              <h3>Team for Cleaners & Co-hosts</h3>
              <p>
                Invite your cleaning crew or co-hosts with role-based access. Control who sees which properties and pages. Perfect for STR management teams.
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
            {free
              ? `Free: ${free.maxProperties} property, ${free.maxUsers} user, ${free.maxInventoryItems} items. Starter and Pro add more capacity.`
              : "Free, Starter, and Pro plans for teams of all sizes."}
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
                <div className="plan-icon"><Icon name="stock" size={22} /></div>
                <h3>{free?.name || "Free"}</h3>
                <div className="pricing-price">
                  <span className="price-amount">${free?.monthlyPrice ?? 0}</span>
                  <span className="price-period"> forever</span>
                </div>
              </div>
              <ul className="pricing-features">
                {(free?.marketingFeatures || [
                  "1 property",
                  "1 user (just you)",
                  "Inventory tracking",
                  "Up to 30 inventory items",
                  "No credit card required",
                ]).map((line) => (
                  <li key={line}><Icon name="check" size={14} /> {line}</li>
                ))}
              </ul>
              <button onClick={handleGetStarted} className="pricing-button">
                Get Started Free
              </button>
            </div>

            {/* Starter Plan */}
            <div className="pricing-card featured">
              <div className="pricing-badge"><Icon name="star" size={13} /> Most Popular</div>
              <div className="pricing-header">
                <h3>{starter?.name || "Starter"}</h3>
                <div className="pricing-price">
                  {billingPeriod === 'monthly' ? (
                    <>
                      <span className="price-amount">${starter?.monthlyPrice ?? 18}</span>
                      <span className="price-period"> / month</span>
                    </>
                  ) : (
                    <>
                      <span className="price-amount">${starter?.annualPrice ?? 180}</span>
                      <span className="price-period"> / year</span>
                    </>
                  )}
                </div>
                {billingPeriod === 'annual' && starter && (
                  <div className="annual-savings">
                    Save ${(starter.monthlyPrice * 12) - starter.annualPrice}, 2 months free
                  </div>
                )}
              </div>
              <ul className="pricing-features">
                {(starter?.marketingFeatures || [
                  "3 properties",
                  "3 users included",
                  "Up to 2 extra users",
                  "Everything in Free",
                ]).map((line) => (
                  <li key={line}><Icon name="check" size={14} /> {line}</li>
                ))}
              </ul>
              <button onClick={handleGetStarted} className="pricing-button primary">
                Start Starter Plan
              </button>
            </div>

            {/* Pro Plan */}
            <div className="pricing-card">
              <div className="pricing-header">
                <div className="plan-icon"><Icon name="flame" size={22} /></div>
                <h3>{pro?.name || "Pro"}</h3>
                <p style={{ color: '#10b981', fontWeight: '600', fontSize: '14px', margin: '0 0 12px 0' }}>
                  <Icon name="gift" size={15} /> Free 14 day trial
                </p>
                <div className="pricing-price">
                  {billingPeriod === 'monthly' ? (
                    <>
                      <span className="price-amount">${pro?.monthlyPrice ?? 39}</span>
                      <span className="price-period"> / month</span>
                    </>
                  ) : (
                    <>
                      <span className="price-amount">${pro?.annualPrice ?? 390}</span>
                      <span className="price-period"> / year</span>
                    </>
                  )}
                </div>
                {billingPeriod === 'annual' && pro && (
                  <div className="annual-savings">
                    Save ${(pro.monthlyPrice * 12) - pro.annualPrice}, 2 months free
                  </div>
                )}
              </div>
              <ul className="pricing-features">
                {(pro?.marketingFeatures || [
                  "10 properties",
                  "5 users included",
                  "Everything in Starter",
                ]).map((line) => (
                  <li key={line}><Icon name="check" size={14} /> {line}</li>
                ))}
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
          <h2 className="cta-title">Ready to Simplify Your STR Operations?</h2>
          <p className="cta-subtitle">
            Join short-term rental hosts who've stopped using spreadsheets for supplies. Track inventory, bill owners, and manage turnovers in one place.
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
      <Modal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        title="Contact Support"
        busy={supportSending}
        maxWidth="440px"
      >
        {supportResult && (
          <p className={supportResult.ok ? "form-banner success" : "form-banner error"}>
            {supportResult.message}
          </p>
        )}
        <form onSubmit={handleSupportSubmit} className="stacked-form">
          <FormField label="Name">
            {(inputProps) => (
              <input
                {...inputProps}
                type="text"
                value={supportForm.name}
                onChange={(e) => setSupportForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your name"
              />
            )}
          </FormField>
          <FormField label="Email" required>
            {(inputProps) => (
              <input
                {...inputProps}
                type="email"
                required
                value={supportForm.email}
                onChange={(e) => setSupportForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
              />
            )}
          </FormField>
          <FormField label="What are you looking for?" required>
            {(inputProps) => (
              <textarea
                {...inputProps}
                required
                value={supportForm.message}
                onChange={(e) => setSupportForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Describe your question or issue..."
                rows={4}
              />
            )}
          </FormField>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setSupportOpen(false)} disabled={supportSending}>
              Cancel
            </Button>
            <Button type="submit" disabled={supportSending}>
              {supportSending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
