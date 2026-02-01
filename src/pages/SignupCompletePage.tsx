import React, { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { authApi } from "../services/authApi";

export const SignupCompletePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const pendingToken = searchParams.get("pending") || "";
  const sessionId = searchParams.get("session_id") || "";
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pendingToken || !sessionId) {
      setError("Invalid or incomplete link. Please sign up again from the login page.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await authApi.signupComplete({ pendingToken, sessionId });
        if (!cancelled) {
          setMessage(res.message || "Account created successfully.");
          setTimeout(() => {
            navigate("/login", { state: { message: "Account created. Verify your email, then sign in." } });
          }, 3000);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not complete signup. Please try again or contact support.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingToken, sessionId, navigate]);

  return (
    <div className="login-container">
      <div className="login-card">
        <Link to="/" className="login-home-button" aria-label="Go to home">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Home
        </Link>
        <img src="/logo.png" alt="StockStay" className="login-logo" />
        <h1 className="brand-name">
          <span className="brand-stock">Stock</span>
          <span className="brand-stay">Stay</span>
        </h1>
        <p className="login-subtitle">Complete signup</p>

        {loading && <p className="signup-complete-loading">Completing your signup...</p>}
        {message && <div className="success-message" role="alert">{message}</div>}
        {error && <div className="error-message">{error}</div>}

        {!loading && (
          <Link to="/login" className="login-button" style={{ display: "inline-block", marginTop: "16px", textAlign: "center" }}>
            Back to Login
          </Link>
        )}
      </div>
    </div>
  );
};
