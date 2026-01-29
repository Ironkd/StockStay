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
          <p className="legal-updated">Last updated: January 2026</p>

          <section>
            <h2>1. Introduction</h2>
            <p>
              Stock Stay (“we”, “our”, or “us”) operates the inventory management service at stockstay.com. This Privacy
              Policy describes how we collect, use, store, and protect your information when you use our Service.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>
            <p>We collect information you provide directly and information we obtain from your use of the Service.</p>
            <ul>
              <li>
                <strong>Account and profile:</strong> email address, name, and password (stored in hashed form).
              </li>
              <li>
                <strong>Business data:</strong> inventory items, warehouses, clients, invoices, sales, and other data
                you enter into the Service.
              </li>
              <li>
                <strong>Usage and technical data:</strong> log data (e.g. IP address, browser type, access times),
                and device information as needed to operate and secure the Service.
              </li>
            </ul>
          </section>

          <section>
            <h2>3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Provide, maintain, and improve the Service</li>
              <li>Authenticate you and manage your account</li>
              <li>Process and store your inventory, client, and invoice data</li>
              <li>Send you service-related communications (e.g. security or product updates)</li>
              <li>Comply with legal obligations and enforce our Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2>4. Data Storage and Processing</h2>
            <p>
              Your data is stored and processed using Supabase (PostgreSQL and related infrastructure). Supabase
              processes data in accordance with its own privacy and security practices. By using Stock Stay, you consent
              to this storage and processing as described here.
            </p>
          </section>

          <section>
            <h2>5. Data Sharing</h2>
            <p>
              We do not sell your personal information. We may share your information only: (a) with service providers
              who assist in operating the Service (e.g. hosting, database) under contractual obligations to protect your
              data; (b) if required by law or to protect our rights and safety; or (c) in connection with a merger,
              sale, or transfer of assets, with notice where required.
            </p>
          </section>

          <section>
            <h2>6. Security</h2>
            <p>
              We use industry-standard measures (including encryption, access controls, and secure protocols) to protect
              your data. You are responsible for keeping your password confidential. Please report any suspected
              unauthorized access to your account.
            </p>
          </section>

          <section>
            <h2>7. Your Rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct, delete, or export your personal data,
              or to object to or restrict certain processing. You can update account and profile information in the
              Service. For other requests, contact us using the support or contact information on stockstay.com.
            </p>
          </section>

          <section>
            <h2>8. Cookies and Similar Technologies</h2>
            <p>
              We use cookies and similar technologies necessary to operate the Service (e.g. session and authentication).
              We may use analytics to understand how the Service is used and to improve it. You can adjust your browser
              settings to limit or block cookies; some features may not work correctly if you disable essential cookies.
            </p>
          </section>

          <section>
            <h2>9. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active or as needed to provide the Service and comply
              with legal obligations. After account closure, we may retain certain data for backup, legal, or
              legitimate business purposes in accordance with applicable law.
            </p>
          </section>

          <section>
            <h2>10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will post the updated policy on this page and
              update the “Last updated” date. Continued use of the Service after changes constitutes acceptance of the
              revised policy.
            </p>
          </section>

          <section>
            <h2>11. Contact</h2>
            <p>
              For questions about this Privacy Policy or our data practices, contact us at the support or contact
              information provided on stockstay.com.
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
