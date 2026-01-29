import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const LoginPage: React.FC = () => {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!usernameOrEmail || !password) {
      setError("Please enter both username/email and password");
      setLoading(false);
      return;
    }

    try {
      // Convert usernameOrEmail to email format
      // If it contains @, use it as email, otherwise treat as username and append @example.com
      const email = usernameOrEmail.includes("@")
        ? usernameOrEmail
        : `${usernameOrEmail}@example.com`;

      const success = await login(email, password);
      if (success) {
        navigate("/dashboard");
      } else {
        setError("Invalid credentials");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordMessage("");

    if (!forgotPasswordEmail) {
      setForgotPasswordMessage("Please enter your email address");
      return;
    }

    // In a real app, this would send a password reset email
    // For demo purposes, we'll just show a success message
    setForgotPasswordMessage(
      `Password reset instructions have been sent to ${forgotPasswordEmail}`
    );
    setTimeout(() => {
      setShowForgotPassword(false);
      setForgotPasswordEmail("");
      setForgotPasswordMessage("");
    }, 3000);
  };

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
        <p className="login-subtitle">
          {isSignUpMode ? "Create your account" : "Sign in to continue"}
        </p>

        {!showForgotPassword ? (
          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="error-message">{error}</div>}

            <label>
              <span>Username or Email</span>
              <input
                type="text"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="username or your@email.com"
                required
                autoFocus
              />
            </label>

            <label>
              <span>Password</span>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {!isSignUpMode && (
              <div className="forgot-password-link">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="forgot-password-button"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? (isSignUpMode ? "Creating account..." : "Signing in...") : isSignUpMode ? "Sign Up" : "Sign In"}
            </button>

            <div className="auth-switch">
              {isSignUpMode ? (
                <>
                  <span>Already have an account?</span>
                  <button
                    type="button"
                    className="auth-switch-button"
                    onClick={() => setIsSignUpMode(false)}
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  <span>Don't have an account?</span>
                  <button
                    type="button"
                    className="auth-switch-button"
                    onClick={() => {
                      setIsSignUpMode(true);
                      setShowForgotPassword(false);
                    }}
                  >
                    Sign up
                  </button>
                </>
              )}
            </div>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="login-form">
            <h2>Reset Password</h2>
            <p className="forgot-password-text">
              Enter your email address and we'll send you instructions to reset
              your password.
            </p>

            {forgotPasswordMessage && (
              <div
                className={`forgot-password-message ${
                  forgotPasswordMessage.includes("sent")
                    ? "success"
                    : "error"
                }`}
              >
                {forgotPasswordMessage}
              </div>
            )}

            <label>
              <span>Email</span>
              <input
                type="email"
                value={forgotPasswordEmail}
                onChange={(e) => setForgotPasswordEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
              />
            </label>

            <div className="forgot-password-actions">
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotPasswordEmail("");
                  setForgotPasswordMessage("");
                }}
                className="login-button secondary"
              >
                Cancel
              </button>
              <button type="submit" className="login-button">
                Send Reset Link
              </button>
            </div>
          </form>
        )}

        {!showForgotPassword && (
          <p className="login-hint">
            Demo: Use <strong>demo@example.com</strong> / <strong>demo123</strong> or any email/password
          </p>
        )}
      </div>
    </div>
  );
};
