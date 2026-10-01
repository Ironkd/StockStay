import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, FormField, Icon } from "../components/ui";
import { authApi } from "../services/authApi";

function PasswordToggle({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="password-toggle"
      onClick={onToggle}
      aria-label={show ? "Hide password" : "Show password"}
    >
      <Icon name={show ? "eye-off" : "eye"} size={20} />
    </Button>
  );
}

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invalid reset link. Please use the link from your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => {
        navigate("/login", { state: { message: "Password reset successfully. You can sign in now." } });
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="login-container">
        <div className="login-card">
          <Link to="/" className="login-home-button" aria-label="Go to home">
            <Icon name="home" size={18} />
            Home
          </Link>
          <img src="/logo.png" alt="Stock Stay" className="login-logo" />
          <h1 className="brand-name">
            <span className="brand-stock">Stock</span>
            <span className="brand-stay">Stay</span>
          </h1>
          <p className="login-subtitle">Reset password</p>
          <div className="error-message">Invalid or missing reset link. Please request a new password reset from the login page.</div>
          <Button type="button" className="login-button" onClick={() => navigate("/login")}>Back to Login</Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card">
          <img src="/logo.png" alt="Stock Stay" className="login-logo" />
          <h1 className="brand-name">
            <span className="brand-stock">Stock</span>
            <span className="brand-stay">Stay</span>
          </h1>
          <p className="login-subtitle">Password reset successfully</p>
          <div className="forgot-password-message success">Your password has been updated. Redirecting to login...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <Link to="/" className="login-home-button" aria-label="Go to home">
          <Icon name="home" size={18} />
          Home
        </Link>
        <img src="/logo.png" alt="Stock Stay" className="login-logo" />
        <h1 className="brand-name">
          <span className="brand-stock">Stock</span>
          <span className="brand-stay">Stay</span>
        </h1>
        <p className="login-subtitle">Choose a new password</p>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}

          <FormField label="New password (at least 8 characters)" required>
            {(inputProps) => (
              <div className="password-input-wrapper">
                <input
                  {...inputProps}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  minLength={8}
                  autoFocus
                />
                <PasswordToggle show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
              </div>
            )}
          </FormField>

          <FormField label="Confirm new password" required>
            {(inputProps) => (
              <input
                {...inputProps}
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                minLength={8}
              />
            )}
          </FormField>

          <Button type="submit" className="login-button" disabled={loading}>
            {loading ? "Updating..." : "Reset password"}
          </Button>

          <p className="auth-switch">
            <Link to="/login">Back to login</Link>
          </p>
        </form>
      </div>
    </div>
  );
};
