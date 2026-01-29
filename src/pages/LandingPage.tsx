import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // If user is already logged in, redirect to dashboard
  React.useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const handleGetStarted = () => {
    navigate("/login");
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
              <button onClick={handleGetStarted} className="nav-button secondary">
                Sign In
              </button>
              <button onClick={handleGetStarted} className="nav-button primary">
                Get Started
              </button>
            </div>
          </nav>

          <div className="hero-content">
            <h1 className="hero-title">
              Stock Stay – Inventory Management
            </h1>
            <p className="hero-domain">stockstay.com</p>
            <p className="hero-subtitle hero-lead">
              Stock Stay is an inventory management platform that helps you track stock levels,
              manage multiple warehouses, create and send invoices, and collaborate with your team—all in one place. Built for small teams and growing businesses.
            </p>
            <p className="hero-subtitle">
              Streamline operations, get low-stock alerts, and keep your inventory under control at <strong>stockstay.com</strong>.
            </p>
            <div className="hero-cta">
              <button onClick={handleGetStarted} className="cta-button primary">
                Start Free Trial
              </button>
              <button onClick={handleGetStarted} className="cta-button secondary">
                Watch Demo
              </button>
            </div>
            <p className="hero-note">No credit card required • Free plan available</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-features">
        <div className="landing-container">
          <h2 className="section-title">Everything You Need to Manage Inventory</h2>
          <p className="section-subtitle">
            Powerful features designed to help you stay organized and efficient
          </p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Real-Time Tracking</h3>
              <p>
                Monitor stock levels in real-time across multiple warehouses.
                Get instant alerts when items are running low.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🏢</div>
              <h3>Multi-Warehouse Support</h3>
              <p>
                Manage inventory across multiple locations. Start with one free warehouse,
                add more as you grow.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📋</div>
              <h3>Smart Categories</h3>
              <p>
                Organize your inventory with custom categories and tags.
                Find what you need instantly with powerful search and filters.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">💰</div>
              <h3>Invoice Management</h3>
              <p>
                Create and manage invoices seamlessly. Track payments,
                send reminders, and manage your client relationships.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📈</div>
              <h3>Analytics & Reports</h3>
              <p>
                Get insights into your inventory with detailed analytics.
                Track trends, identify bestsellers, and make data-driven decisions.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h3>Team Collaboration</h3>
              <p>
                Invite team members, assign roles, and collaborate seamlessly.
                Control access with granular permissions.
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

          <div className="pricing-grid">
            <div className="pricing-card">
              <div className="pricing-header">
                <h3>Free</h3>
                <div className="pricing-price">
                  <span className="price-amount">$0</span>
                  <span className="price-period">/month</span>
                </div>
              </div>
              <ul className="pricing-features">
                <li>✓ 1 Warehouse</li>
                <li>✓ Unlimited Inventory Items</li>
                <li>✓ Basic Analytics</li>
                <li>✓ Invoice Management</li>
                <li>✓ Client Management</li>
                <li>✓ Team Collaboration</li>
              </ul>
              <button onClick={handleGetStarted} className="pricing-button">
                Get Started Free
              </button>
            </div>

            <div className="pricing-card featured">
              <div className="pricing-badge">Most Popular</div>
              <div className="pricing-header">
                <h3>Pro</h3>
                <div className="pricing-price">
                  <span className="price-amount">$29</span>
                  <span className="price-period">/month</span>
                </div>
              </div>
              <ul className="pricing-features">
                <li>✓ Unlimited Warehouses</li>
                <li>✓ Unlimited Inventory Items</li>
                <li>✓ Advanced Analytics</li>
                <li>✓ Priority Support</li>
                <li>✓ Custom Reports</li>
                <li>✓ API Access</li>
                <li>✓ Everything in Free</li>
              </ul>
              <button onClick={handleGetStarted} className="pricing-button primary">
                Upgrade to Pro
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
            Join businesses managing their inventory with Stock Stay at stockstay.com
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
              <a href="#pricing">Pricing</a>
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
