import React from "react";
import { Link, useNavigate } from "react-router-dom";

export const PrivacyPage: React.FC = () => {
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
              <button type="button" onClick={() => navigate("/login")} className="nav-button primary">
                Get Started
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="legal-content">
        <div className="legal-inner">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: August 2026</p>
          <p style={{ fontSize: "13px", color: "#64748b" }}>
            This is product boilerplate for an alpha SaaS release and is not a substitute for legal advice.
          </p>

          <section>
            <h2>1. Introduction</h2>
            <p>
              Stock Stay (“we”, “our”, or “us”) operates the inventory and billing service at stockstay.com. This Privacy
              Policy describes how we collect, use, store, and protect information when you use our Service.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>
            <p>We collect information you provide and information from your use of the Service.</p>
            <ul>
              <li>
                <strong>Account and profile:</strong> email address, name, and password (stored in hashed form).
              </li>
              <li>
                <strong>Business data:</strong> inventory, properties, clients, invoices, stock movements, and other
                data you enter into the Service.
              </li>
              <li>
                <strong>Support messages:</strong> name, email, and message content when you contact us (including
                in-app feedback).
              </li>
              <li>
                <strong>Usage and technical data:</strong> log data (e.g. IP address, browser type, access times) as
                needed to operate and secure the Service; optional product analytics as described below.
              </li>
            </ul>
          </section>

          <section>
            <h2>3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Provide, maintain, and improve the Service</li>
              <li>Authenticate you and manage your account and organization memberships</li>
              <li>Process inventory, client, and billing data you store</li>
              <li>Respond to support and feedback requests</li>
              <li>Send service-related communications (e.g. security or product updates)</li>
              <li>Understand product usage via privacy-friendly analytics (when enabled)</li>
              <li>Comply with legal obligations and enforce our Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2>4. Authentication and browser storage</h2>
            <p>
              When you sign in, we store an authentication token in your browser’s <strong>sessionStorage</strong>. That
              token is cleared when the browser tab/session ends and is not a persistent marketing cookie. We do not use
              a third-party marketing cookie banner for the main app because auth is sessionStorage-based.
            </p>
            <p>
              Platform operators who use the AdminJS console at <code>/admin</code> on the API host may receive{" "}
              <strong>session cookies</strong> required for that admin interface only. Those cookies are not used for
              end-user product authentication.
            </p>
          </section>

          <section>
            <h2>5. Analytics</h2>
            <p>
              When configured, we use <strong>Umami</strong> (privacy-friendly, cookieless analytics) to measure page
              views and limited product events such as signup and feedback submitted. Umami is loaded only when analytics
              environment variables are set. We do not use Google Analytics for this alpha release.
            </p>
          </section>

          <section>
            <h2>6. Data Storage and Processing</h2>
            <p>
              Your data is stored and processed using our hosting and database providers (including PostgreSQL
              infrastructure such as Supabase where deployed). Providers process data under their own privacy and
              security practices. By using Stock Stay, you consent to this storage and processing as described here.
            </p>
          </section>

          <section>
            <h2>7. Data Sharing</h2>
            <p>
              We do not sell your personal information. We may share information only: (a) with service providers who
              assist in operating the Service (hosting, email, analytics) under obligations to protect your data; (b) if
              required by law or to protect our rights and safety; or (c) in connection with a merger, sale, or transfer
              of assets, with notice where required.
            </p>
          </section>

          <section>
            <h2>8. Security</h2>
            <p>
              We use industry-standard measures (including encryption in transit, access controls, and hashed passwords)
              to protect your data. You are responsible for keeping your password confidential. Report suspected
              unauthorized access to support@stockstay.com.
            </p>
          </section>

          <section>
            <h2>9. Your Rights and deletion</h2>
            <p>
              Depending on your location, you may have rights to access, correct, delete, or export personal data, or to
              object to or restrict certain processing. You can update profile information in Settings. During alpha,
              account and data deletion is handled by support (email support@stockstay.com); there is no self-serve
              “delete my account” button yet.
            </p>
          </section>

          <section>
            <h2>10. Cookies and similar technologies</h2>
            <p>
              The main product does not rely on third-party marketing cookies. Auth uses sessionStorage as described
              above. AdminJS on the API host may set session cookies for allowlisted platform admins only. Optional Umami
              analytics is designed to avoid tracking cookies. You can limit cookies in your browser; essential admin
              session cookies may be required for <code>/admin</code> to work.
            </p>
          </section>

          <section>
            <h2>11. Data Retention</h2>
            <p>
              We retain your data while your account is active or as needed to provide the Service and meet legal
              obligations. After deletion or account closure, we may retain limited data for backup, legal, or
              legitimate business purposes as required by applicable law.
            </p>
          </section>

          <section>
            <h2>12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will post the updated policy on this page and
              update the “Last updated” date. Continued use after changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2>13. Contact</h2>
            <p>
              Questions about this Privacy Policy or data practices:{" "}
              <a href="mailto:support@stockstay.com">support@stockstay.com</a>.
            </p>
          </section>
        </div>
      </main>

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
              <a href="/#pricing">Pricing</a>
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
