import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
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

const PROVINCES = [
  { value: "", label: "Select province" },
  { value: "AB", label: "Alberta" },
  { value: "BC", label: "British Columbia" },
  { value: "MB", label: "Manitoba" },
  { value: "NB", label: "New Brunswick" },
  { value: "NL", label: "Newfoundland and Labrador" },
  { value: "NS", label: "Nova Scotia" },
  { value: "NT", label: "Northwest Territories" },
  { value: "NU", label: "Nunavut" },
  { value: "ON", label: "Ontario" },
  { value: "PE", label: "Prince Edward Island" },
  { value: "QC", label: "Quebec" },
  { value: "SK", label: "Saskatchewan" },
  { value: "YT", label: "Yukon" },
  { value: "Other", label: "Other" },
];

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<"CA" | "US">("CA");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupStep, setSignupStep] = useState<1 | 2 | 3>(1);
  const [isSignUpMode, setIsSignUpMode] = useState(
    () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("mode") === "signup"
  );
  const [signupSuccess, setSignupSuccess] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
  const [showEmailAlreadyRegisteredPopup, setShowEmailAlreadyRegisteredPopup] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Sync sign-up mode when URL changes (e.g. client-side nav to /login?mode=signup)
  React.useEffect(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    if (mode === "signup") {
      setIsSignUpMode(true);
      setSignupStep(1);
    }
  }, [location.search]);

  const resetSuccessMessage = location.state?.message;
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const trialStartedFromUrl = params.get("trial_started") === "1";
  const checkoutCancelledFromUrl = params.get("checkout") === "cancelled";
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
      if (signupStep === 1) {
        if (!email?.trim() || !firstName.trim() || !lastName.trim()) {
          setError("Please enter first name, last name, and email");
          setLoading(false);
          return;
        }
        setSignupStep(2);
        setLoading(false);
        return;
      }

      if (signupStep === 2) {
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
        if (!isInviteSignup) {
          setSignupStep(3);
          setLoading(false);
          return;
        }
        if (isInviteSignup && !inviteToken) {
          setError("The invitation link is incomplete. Please use the full link from your invitation email to join the team.");
          setLoading(false);
          return;
        }
        const fullName = `${firstName.trim()} ${lastName.trim()}`;
        const addressParts = [street.trim(), city.trim(), province.trim(), postalCode.trim()].filter(Boolean);
        const addressStr = addressParts.length > 0 ? addressParts.join(", ") : undefined;
        const prefix = phoneCountry === "CA" ? "+1" : "+1";
        const phoneStr = phoneNumber.trim() ? `${prefix} ${phoneNumber.trim().replace(/\D/g, "")}` : undefined;
        try {
          const response = await authApi.signup({
            email: email.trim(),
            password,
            fullName,
            address: addressStr,
            phoneNumber: phoneStr,
            startProTrial: false,
            ...(inviteToken ? { inviteToken: inviteToken.trim() } : {}),
          });
          if (response.joinedTeam) {
            navigate("/verify-email?pending=1");
            return;
          }
          setSignupSuccess("Account created. Check your email to verify your address, then sign in.");
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

  const handleContinueToPayment = async () => {
    setError("");
    setLoading(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const addressParts = [street.trim(), city.trim(), province.trim(), postalCode.trim()].filter(Boolean);
    const addressStr = addressParts.length > 0 ? addressParts.join(", ") : undefined;
    const prefix = phoneCountry === "CA" ? "+1" : "+1";
    const phoneStr = phoneNumber.trim() ? `${prefix} ${phoneNumber.trim().replace(/\D/g, "")}` : undefined;
    try {
      const { checkoutUrl } = await authApi.signupCheckout({
        email: email.trim(),
        password,
        fullName,
        address: addressStr,
        phoneNumber: phoneStr,
      });
      window.location.href = checkoutUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start checkout. Please try again.";
      if (message.toLowerCase().includes("already exists")) {
        setShowEmailAlreadyRegisteredPopup(true);
        setError("");
      } else {
        setError(message);
      }
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
      setForgotPasswordMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    }
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
          {isSignUpMode
            ? isInviteSignup
              ? "Create your account"
              : `Create your account — Step ${signupStep} of 3`
            : "Sign in to continue"}
        </p>

        {showEmailAlreadyRegisteredPopup ? (
          <div className="modal-overlay" onClick={() => setShowEmailAlreadyRegisteredPopup(false)} role="dialog" aria-modal="true" aria-labelledby="email-registered-title">
            <div className="modal-content email-already-registered-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px" }}>
              <h2 id="email-registered-title" className="email-registered-title">Your email is already registered</h2>
              <p className="email-registered-text">Sign in with your password, or reset it if you don&apos;t remember it.</p>
              <div className="email-registered-actions">
                <button
                  type="button"
                  className="login-button"
                  onClick={() => {
                    setShowEmailAlreadyRegisteredPopup(false);
                    setForgotPasswordEmail(email);
                    setShowForgotPassword(true);
                  }}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="login-button secondary"
                  onClick={() => setShowEmailAlreadyRegisteredPopup(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : !showForgotPassword ? (
          signupSuccess ? (
            <div className="login-form signup-success-view">
              <div className="success-message" role="alert">
                {signupSuccess}
              </div>
              <p className="signup-success-hint">Check your inbox for the verification link, then sign in below.</p>
              <button
                type="button"
                className="login-button"
                onClick={() => {
                  setSignupSuccess("");
                  setIsSignUpMode(false);
                }}
              >
                Sign in
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="login-form">
            {resetSuccessMessage && (
              <div className="forgot-password-message success">{resetSuccessMessage}</div>
            )}
            {!inviteToken && trialStartedFromUrl && (
              <div className="forgot-password-message success" role="alert">
                Payment method added. Your 14-day trial is active. Verify your email to sign in.
              </div>
            )}
            {!inviteToken && checkoutCancelledFromUrl && (
              <div className="forgot-password-message success" role="alert">
                Payment is required to complete signup. Complete the steps and click Continue to payment when ready.
              </div>
            )}
            {error && <div className="error-message">{error}</div>}

            {isSignUpMode && signupStep === 1 && (
              <>
                <label>
                  <span>First name</span>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    required
                    autoFocus
                  />
                </label>
                <label>
                  <span>Last name</span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    required
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                  />
                </label>
                <label>
                  <span>Street address</span>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="123 Main St"
                  />
                </label>
                <div className="form-row">
                  <label>
                    <span>Town / City</span>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                    />
                  </label>
                  <label>
                    <span>Province</span>
                    <select
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      className="province-select"
                      aria-label="Province"
                    >
                      {PROVINCES.map((p) => (
                        <option key={p.value || "empty"} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span>Postal code</span>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="A1A 1A1 or 12345"
                  />
                </label>
                <label>
                  <span>Phone number</span>
                  <div className="phone-input-wrapper">
                    <select
                      value={phoneCountry}
                      onChange={(e) => setPhoneCountry(e.target.value as "CA" | "US")}
                      className="phone-country-select"
                      aria-label="Country"
                    >
                      <option value="CA">🇨🇦 Canada (+1)</option>
                      <option value="US">🇺🇸 US (+1)</option>
                    </select>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder={phoneCountry === "CA" ? "234 567 8900" : "234 567 8900"}
                      className="phone-number-input"
                    />
                  </div>
                </label>
                <button type="submit" className="login-button" disabled={loading}>
                  {loading ? "Next..." : "Next"}
                </button>
              </>
            )}

            {isSignUpMode && signupStep === 2 && (
              <>
                {isInviteSignup && (
                  <p className="invite-signup-hint" style={{ fontSize: "13px", color: "#64748b", marginBottom: "8px" }}>
                    You&apos;re signing up to join a team. No payment required.
                  </p>
                )}
                <label>
                  <span>Password</span>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="8+ chars, upper, lower, number, symbol"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                </label>
                <label>
                  <span>Confirm password</span>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                </label>
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
                <div className="signup-step-actions">
                  <button
                    type="button"
                    className="login-button secondary"
                    onClick={() => setSignupStep(1)}
                  >
                    Back
                  </button>
                  <button type="submit" className="login-button" disabled={loading}>
                    {loading ? "Creating account..." : isInviteSignup ? "Sign Up" : "Next"}
                  </button>
                </div>
              </>
            )}

            {isSignUpMode && signupStep === 3 && (
              <>
                <div className="signup-payment-copy">
                  <p><strong>Payment is required to complete signup.</strong></p>
                  <p>Add a payment method to start your 14-day Pro trial. You won&apos;t be charged until your trial ends.</p>
                </div>
                <div className="signup-step-actions">
                  <button
                    type="button"
                    className="login-button secondary"
                    onClick={() => setSignupStep(2)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="login-button"
                    onClick={handleContinueToPayment}
                    disabled={loading}
                  >
                    {loading ? "Redirecting..." : "Continue to payment"}
                  </button>
                </div>
              </>
            )}

            {!isSignUpMode && (
              <>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
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
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                </label>
                <div className="forgot-password-link">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="forgot-password-button"
                  >
                    Forgot Password?
                  </button>
                </div>
                <button type="submit" className="login-button" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </>
            )}

            <div className="auth-switch">
              {isSignUpMode ? (
                <>
                  <span>Already have an account?</span>
                  <button
                    type="button"
                    className="auth-switch-button"
                    onClick={() => {
                      setIsSignUpMode(false);
                      setSignupSuccess("");
                      setSignupStep(1);
                    }}
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
                      setSignupSuccess("");
                      setSignupStep(1);
                    }}
                  >
                    Sign up
                  </button>
                </>
              )}
            </div>
          </form>
          )
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
        ) }

        {!showForgotPassword && !isSignUpMode && (
          <p className="login-hint">
            Demo: Use <strong>demo@example.com</strong> / <strong>demo123</strong>
          </p>
        )}
      </div>
    </div>
  );
};
