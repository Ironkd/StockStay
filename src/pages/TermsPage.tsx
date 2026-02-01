import React from "react";
import { Link, useNavigate } from "react-router-dom";

export const TermsPage: React.FC = () => {
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
          <h1>Terms of Service</h1>
          <p className="legal-updated">Last updated: January 2026</p>

          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using Stock Stay (“the Service”) at stockstay.com, you agree to be bound by these Terms of Service.
              If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2>2. Description of Service</h2>
            <p>
              Stock Stay is an inventory management platform that helps you track stock levels, manage properties,
              create invoices, and collaborate with your team. We reserve the right to modify or discontinue the Service
              (in whole or in part) with reasonable notice where practicable.
            </p>
          </section>

          <section>
            <h2>3. Account and Use</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account and password and for all activity
              under your account. You agree to use the Service only for lawful purposes and in accordance with these Terms.
              You may not use the Service to transmit harmful code, abuse other users, or violate any applicable laws.
            </p>
          </section>

          <section>
            <h2>4. Your Data</h2>
            <p>
              You retain ownership of the data you submit to the Service. By using the Service, you grant us the rights
              necessary to operate and provide the Service (e.g. storing and processing your data). Our use of your data
              is also described in our <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2>5. Acceptable Use</h2>
            <p>
              You may not use the Service to: (a) violate any law or regulation; (b) infringe others’ intellectual
              property or privacy; (c) distribute malware or attempt to gain unauthorized access to our or others’
              systems; (d) resell or sublicense the Service without authorization; or (e) use the Service in a way that
              could harm, overload, or impair the Service or other users.
            </p>
          </section>

          <section>
            <h2>6. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, Stock Stay and its providers shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages, or any loss of profits or data, arising from your
              use of or inability to use the Service. Our total liability shall not exceed the amount you paid us in the
              twelve (12) months preceding the claim, or one hundred dollars (USD 100), whichever is greater.
            </p>
          </section>

          <section>
            <h2>7. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service if you breach these Terms or for other operational
              or legal reasons. You may stop using the Service at any time. Upon termination, your right to use the
              Service ceases; we may retain or delete your data in accordance with our data retention practices and
              Privacy Policy.
            </p>
          </section>

          <section>
            <h2>8. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. We will post the updated Terms on this page and update the
              “Last updated” date. Continued use of the Service after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2>9. Contact</h2>
            <p>
              For questions about these Terms, contact us at the support or contact information provided on stockstay.com.
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
