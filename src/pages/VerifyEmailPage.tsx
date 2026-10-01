import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Icon } from "../components/ui";
import { authApi } from "../services/authApi";

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const pending = searchParams.get("pending") === "1";
  const navigate = useNavigate();
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

  const badgeTone =
    status === "success" ? "success" : status === "error" ? "danger" : status === "pending" ? "warning" : "info";
  const badgeLabel =
    status === "success"
      ? "Verified"
      : status === "error"
        ? "Verification failed"
        : status === "pending"
          ? "Pending verification"
          : "Verifying";

  return (
    <div className="login-container">
      <div className="login-card">
        <Link to="/" className="login-home-button" aria-label="Go to home">
          <Icon name="home" size={18} />
          Home
        </Link>
        <img src="/logo.png" alt="StockStay" className="login-logo" />
        <h1 className="brand-name">
          <span className="brand-stock">Stock</span>
          <span className="brand-stay">Stay</span>
        </h1>
        <p className="login-subtitle">Verify your email</p>

        <div className="auth-status-stack">
          <div className="auth-status-meta">
            <Badge tone={badgeTone}>{badgeLabel}</Badge>
          </div>

          {status === "pending" && (
            <>
              <div className="success-message" role="alert">
                We&apos;ve sent you a verification email. Check your inbox and click the link to verify your address.
              </div>
              <p className="login-hint auth-status-hint">After you verify, you can sign in to join your team.</p>
              <Button type="button" className="login-button" onClick={() => navigate("/login")}>
                Sign in
              </Button>
            </>
          )}

          {status === "loading" && (
            <div className="login-hint auth-status-hint" role="status" aria-live="polite">
              Verifying your email...
            </div>
          )}

          {status === "success" && (
            <>
              <div className="success-message" role="alert">{message}</div>
              <Button type="button" className="login-button" onClick={() => navigate("/login")}>
                Sign in
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="error-message" role="alert">{message}</div>
              <Button type="button" variant="secondary" className="login-button" onClick={() => navigate("/login")}>
                Back to sign in
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
