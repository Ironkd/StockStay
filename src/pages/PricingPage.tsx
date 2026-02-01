import React from "react";
import { Link, useNavigate } from "react-router-dom";

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();

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
          <p className="legal-updated">Plans for teams of all sizes</p>

          <section>
            <h2>Free</h2>
            <p>Get started with core inventory features. Perfect for trying out Stock Stay.</p>
          </section>

          <section>
            <h2>Starter & Pro</h2>
            <p>More properties, more team members, and advanced features. See the app or contact us for current pricing.</p>
            <button type="button" onClick={() => navigate("/login")} className="nav-button primary">
              Sign in to see plans
            </button>
          </section>
        </div>
      </main>
    </div>
  );
};
