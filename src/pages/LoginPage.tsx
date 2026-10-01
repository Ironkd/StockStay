import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button, FormField, Icon, Modal } from "../components/ui";
import { useAuth } from "../contexts/useAuth";
import { track } from "../lib/analytics";
import { authApi } from "../services/authApi";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_HAS_UPPER = /[A-Z]/;
const PASSWORD_HAS_LOWER = /[a-z]/;
const PASSWORD_HAS_NUMBER = /\d/;
const PASSWORD_HAS_SYMBOL = /[^A-Za-z0-9]/;

function getPasswordError(value: string): string | null {
  if (!value || value.length < PASSWORD_MIN_LENGTH) {
    return "Password must be at least 8 characters";
  }
  if (!PASSWORD_HAS_UPPER.test(value)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!PASSWORD_HAS_LOWER.test(value)) {
    return "Password must contain at least one lowercase letter";
  }
  if (!PASSWORD_HAS_NUMBER.test(value)) {
    return "Password must contain at least one number";
  }
  if (!PASSWORD_HAS_SYMBOL.test(value)) {
    return "Password must contain at least one symbol (e.g. !@#$%^&*)";
  }
  return null;
}

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

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(
    () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("mode") === "signup"
  );
  const [signupSuccess, setSignupSuccess] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
  const [showEmailAlreadyRegisteredPopup, setShowEmailAlreadyRegisteredPopup] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    if (mode === "signup") {
      setIsSignUpMode(true);
    }
  }, [location.search]);

  const resetSuccessMessage = location.state?.message;
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const trialStartedFromUrl = params.get("trial_started") === "1";
  const inviteTokenFromParam = params.get("invite");
  const inviteTokenFromRedirect = (() => {
    const r = params.get("redirect");
    if (!r) return null;
    const tryDecode = (str: string, times = 1): string => {
      let s = str;
      for (let i = 0; i < times; i++) {
        try {
          s = decodeURIComponent(s);
        } catch {
          break;
        }
      }
      return s;
    };
    const decoded = tryDecode(r, 2);
    if (!decoded.includes("/accept-invite")) return null;
    const match = decoded.match(/\?([^#]*)$/);
    const q = match ? match[1] : decoded.split("?")[1] ?? "";
    return new URLSearchParams(q).get("token");
  })();
  const inviteToken = inviteTokenFromParam || inviteTokenFromRedirect || null;
  const isRedirectToAcceptInvite = (() => {
    const r = params.get("redirect");
    if (!r) return false;
    try {
      const decoded = decodeURIComponent(r);
      const decodedTwice = decodeURIComponent(decoded);
      return decoded.includes("/accept-invite") || decodedTwice.includes("/accept-invite");
    } catch {
      return false;
    }
  })();
  const isInviteSignup = isSignUpMode && (!!inviteToken || isRedirectToAcceptInvite);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSignupSuccess("");
    setLoading(true);

    if (isSignUpMode) {
      if (!email?.trim() || !firstName.trim() || !lastName.trim()) {
        setError("Please enter your first name, last name, and email.");
        setLoading(false);
        return;
      }
      if (!password || password !== confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }
      const passwordError = getPasswordError(password);
      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        return;
      }
      if (!agreeToTerms) {
        setError("You must agree to the Terms of Service and Privacy Policy to sign up.");
        setLoading(false);
        return;
      }
      if (isInviteSignup && !inviteToken) {
        setError(
          "The invitation link is incomplete. Please use the full link from your invitation email to join the team."
        );
        setLoading(false);
        return;
      }

      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      try {
        const response = await authApi.signup({
          email: email.trim(),
          password,
          fullName,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          ...(inviteToken ? { inviteToken: inviteToken.trim() } : {}),
        });
        if (response.joinedTeam) {
          track("signup", { via: "invite" });
          navigate("/verify-email?pending=1");
          return;
        }
        track("signup", { via: "free" });
        setSignupSuccess(
          "Account created on the Free plan. Check your email to verify your address, then sign in. You can upgrade anytime in Settings."
        );
        setPassword("");
        setConfirmPassword("");
        const redirect = new URLSearchParams(location.search).get("redirect");
        if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
          navigate(redirect);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sign up failed";
        if (message.toLowerCase().includes("already exists")) {
          setShowEmailAlreadyRegisteredPopup(true);
          setError("");
        } else {
          setError(message);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email || !password) {
      setError("Please enter both email and password");
      setLoading(false);
      return;
    }

    const emailNormalized = email.includes("@") ? email : `${email}@example.com`;

    try {
      const success = await login(emailNormalized, password);
      if (success) {
        const redirect = new URLSearchParams(location.search).get("redirect");
        const path = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
        navigate(path);
      } else {
        setError("Invalid credentials");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordMessage("");

    if (!forgotPasswordEmail) {
      setForgotPasswordMessage("Please enter your email address");
      return;
    }

    try {
      await authApi.forgotPassword(forgotPasswordEmail);
      setForgotPasswordMessage(
        "If an account exists with that email, we've sent a password reset link. Check your inbox."
      );
      setTimeout(() => {
        setShowForgotPassword(false);
        setForgotPasswordEmail("");
        setForgotPasswordMessage("");
      }, 5000);
    } catch (err) {
      setForgotPasswordMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

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
        <p className="login-subtitle">{isSignUpMode ? "Create your free account" : "Sign in to continue"}</p>

        <Modal
          open={showEmailAlreadyRegisteredPopup}
          onClose={() => setShowEmailAlreadyRegisteredPopup(false)}
          className="modal-content email-already-registered-popup"
          maxWidth={400}
        >
          <h2 id="email-registered-title" className="email-registered-title">
            Your email is already registered
          </h2>
          <p className="email-registered-text">Sign in with your password, or reset it if you don&apos;t remember it.</p>
          <div className="email-registered-actions">
            <Button
              type="button"
              className="login-button"
              onClick={() => {
                setShowEmailAlreadyRegisteredPopup(false);
                setForgotPasswordEmail(email);
                setShowForgotPassword(true);
              }}
            >
              Forgot password?
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="login-button"
              onClick={() => setShowEmailAlreadyRegisteredPopup(false)}
            >
              Close
            </Button>
          </div>
        </Modal>

        {!showForgotPassword ? (
          signupSuccess ? (
            <div className="login-form signup-success-view">
              <div className="success-message" role="alert">
                {signupSuccess}
              </div>
              <p className="signup-success-hint">Check your inbox for the verification link, then sign in below.</p>
              <Button
                type="button"
                className="login-button"
                onClick={() => {
                  setSignupSuccess("");
                  setIsSignUpMode(false);
                }}
              >
                Sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
              {resetSuccessMessage && <div className="forgot-password-message success">{resetSuccessMessage}</div>}
              {!inviteToken && trialStartedFromUrl && (
                <div className="forgot-password-message success" role="alert">
                  Your trial is active. Verify your email to sign in.
                </div>
              )}
              {error && <div className="error-message">{error}</div>}

              {isSignUpMode && (
                <>
                  <p className="invite-signup-hint">
                    {isInviteSignup
                      ? "You're signing up to join a team. No payment required."
                      : "You'll start on the Free plan. Upgrade anytime from Settings after you sign in."}
                  </p>
                  <FormField label="First name" required>
                    {(inputProps) => (
                      <input
                        {...inputProps}
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        required
                        autoFocus
                      />
                    )}
                  </FormField>
                  <FormField label="Last name" required>
                    {(inputProps) => (
                      <input
                        {...inputProps}
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        required
                      />
                    )}
                  </FormField>
                  <FormField label="Email" required>
                    {(inputProps) => (
                      <input
                        {...inputProps}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        required
                      />
                    )}
                  </FormField>
                  <FormField label="Password" required>
                    {(inputProps) => (
                      <div className="password-input-wrapper">
                        <input
                          {...inputProps}
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="8+ chars, upper, lower, number, symbol"
                          required
                          minLength={8}
                        />
                        <PasswordToggle show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                      </div>
                    )}
                  </FormField>
                  <FormField label="Confirm password" required>
                    {(inputProps) => (
                      <div className="password-input-wrapper">
                        <input
                          {...inputProps}
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter your password"
                          required
                          minLength={8}
                        />
                        <PasswordToggle show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                      </div>
                    )}
                  </FormField>
                  <p className="password-requirements">
                    At least 8 characters, with uppercase, lowercase, a number, and a symbol (e.g. !@#$%^&*).
                  </p>
                  <label className="trial-checkbox">
                    <input
                      type="checkbox"
                      checked={agreeToTerms}
                      onChange={(e) => setAgreeToTerms(e.target.checked)}
                      required
                    />
                    <span>
                      I agree to the{" "}
                      <Link to="/terms" target="_blank" rel="noopener noreferrer">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                        Privacy Policy
                      </Link>
                    </span>
                  </label>
                  <Button type="submit" className="login-button" disabled={loading}>
                    {loading ? "Creating account..." : "Create free account"}
                  </Button>
                </>
              )}

              {!isSignUpMode && (
                <>
                  <FormField label="Email" required>
                    {(inputProps) => (
                      <input
                        {...inputProps}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        required
                        autoFocus
                      />
                    )}
                  </FormField>
                  <FormField label="Password" required>
                    {(inputProps) => (
                      <div className="password-input-wrapper">
                        <input
                          {...inputProps}
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          required
                        />
                        <PasswordToggle show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                      </div>
                    )}
                  </FormField>
                  <div className="forgot-password-link">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowForgotPassword(true)}
                      className="forgot-password-button"
                    >
                      Forgot Password?
                    </Button>
                  </div>
                  <Button type="submit" className="login-button" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                </>
              )}

              <div className="auth-switch">
                {isSignUpMode ? (
                  <>
                    <span>Already have an account?</span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="auth-switch-button"
                      onClick={() => {
                        setIsSignUpMode(false);
                        setSignupSuccess("");
                      }}
                    >
                      Sign in
                    </Button>
                  </>
                ) : (
                  <>
                    <span>Don&apos;t have an account?</span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="auth-switch-button"
                      onClick={() => {
                        setIsSignUpMode(true);
                        setShowForgotPassword(false);
                        setSignupSuccess("");
                      }}
                    >
                      Sign up
                    </Button>
                  </>
                )}
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handleForgotPassword} className="login-form">
            <h2>Reset Password</h2>
            <p className="forgot-password-text">
              Enter your email address and we&apos;ll send you instructions to reset your password.
            </p>

            {forgotPasswordMessage && (
              <div className={`forgot-password-message ${forgotPasswordMessage.includes("sent") ? "success" : "error"}`}>
                {forgotPasswordMessage}
              </div>
            )}

            <FormField label="Email" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoFocus
                />
              )}
            </FormField>

            <div className="forgot-password-actions">
              <Button
                type="button"
                variant="secondary"
                className="login-button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotPasswordEmail("");
                  setForgotPasswordMessage("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" className="login-button">
                Send Reset Link
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
