import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../services/authApi";

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const pending = searchParams.get("pending") === "1";
  const [status, setStatus] = useState<"loading" | "success" | "error" | "pending">(
    !token && pending ? "pending" : "loading"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      if (pending) {
        setStatus("pending");
        return;
      }
      setStatus("error");
      setMessage("Verification link is missing or invalid.");
      return;
    }

    authApi
      .verifyEmail(token)
      .then((res) => {
        setStatus("success");
        setMessage(res.message || "Email verified successfully. You can now sign in.");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed. The link may have expired.");
      });
  }, [token, pending]);

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
        <p className="login-subtitle">Verify your email</p>

        {status === "pending" && (
          <>
            <div className="success-message" role="alert" style={{ marginTop: 16 }}>
              We&apos;ve sent you a verification email. Check your inbox and click the link to verify your address.
            </div>
            <p className="login-hint" style={{ marginTop: 12 }}>
              After you verify, you can sign in to join your team.
            </p>
            <Link to="/login" className="login-button" style={{ display: "inline-block", marginTop: 20, textDecoration: "none", textAlign: "center" }}>
              Sign in
            </Link>
          </>
        )}
        {status === "loading" && (
          <p className="login-hint" style={{ marginTop: 16 }}>
            Verifying your email…
          </p>
        )}
        {status === "success" && (
          <>
            <div className="success-message" role="alert" style={{ marginTop: 16 }}>
              {message}
            </div>
            <Link to="/login" className="login-button" style={{ display: "inline-block", marginTop: 20, textDecoration: "none", textAlign: "center" }}>
              Sign in
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <div className="error-message" role="alert" style={{ marginTop: 16 }}>
              {message}
            </div>
            <Link to="/login" className="login-button secondary" style={{ display: "inline-block", marginTop: 20, textDecoration: "none", textAlign: "center" }}>
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
};
