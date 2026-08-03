import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { teamApi } from "../services/teamApi";
import { apiRequest } from "../config/api";
import { track } from "../lib/analytics";
import { OverLimitBanner } from "./OverLimitBanner";

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const { user, logout, switchTeam } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [headerTeamName, setHeaderTeamName] = useState<string | null>(null);
  const [effectivePlan, setEffectivePlan] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({ name: "", email: "", message: "" });
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<{ ok: boolean; message: string } | null>(null);

  const memberships = user?.memberships ?? [];
  const activeTeamId = user?.activeTeamId || user?.teamId || "";

  useEffect(() => {
    if (!user) {
      setHeaderTeamName(null);
      setEffectivePlan(null);
      return;
    }
    teamApi.getTeamName().then((r) => setHeaderTeamName(r.name)).catch(() => {});
    teamApi.getTeamLimits().then((r) => setEffectivePlan(r.effectivePlan)).catch(() => setEffectivePlan("free"));
  }, [user?.id, user?.teamId, user?.activeTeamId]);

  useEffect(() => {
    const refetch = () =>
      teamApi.getTeamName().then((r) => setHeaderTeamName(r.name)).catch(() => {});
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("team-name-updated", refetch);
    window.addEventListener("active-team-changed", refetch);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("team-name-updated", refetch);
      window.removeEventListener("active-team-changed", refetch);
    };
  }, []);

  const openFeedback = () => {
    setFeedbackResult(null);
    setFeedbackForm({
      name: user?.name?.trim() || "",
      email: user?.email?.trim() || "",
      message: "",
    });
    setShowFeedback(true);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackResult(null);
    setFeedbackSending(true);
    try {
      await apiRequest<{ message: string }>("/contact", {
        method: "POST",
        body: JSON.stringify({
          name: feedbackForm.name.trim(),
          email: feedbackForm.email.trim(),
          message: feedbackForm.message.trim(),
        }),
      });
      setFeedbackResult({ ok: true, message: "Message sent. We'll get back to you soon." });
      track("feedback_sent", { source: "layout" });
      setFeedbackForm((f) => ({ ...f, message: "" }));
      setTimeout(() => {
        setShowFeedback(false);
        setFeedbackResult(null);
      }, 2000);
    } catch (err) {
      setFeedbackResult({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to send. Please try again.",
      });
    } finally {
      setFeedbackSending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleSwitchTeam = async (teamId: string) => {
    if (!teamId || teamId === activeTeamId || switching) return;
    setSwitching(true);
    try {
      await switchTeam(teamId);
      navigate("/dashboard");
    } catch (err) {
      console.error("Failed to switch team:", err);
    } finally {
      setSwitching(false);
    }
  };

  const displayTeamName =
    (headerTeamName ?? user?.teamName ?? "").trim() ||
    (user?.name?.trim() ? `${user.name.trim().split(/\s+/)[0]}'s Team` : "My Team");

  const navItems: Array<{ path: string; label: string; icon: string; pageKey: string; proOnly?: boolean }> = [
    { path: "/dashboard", label: "Home", icon: "🏠", pageKey: "home" },
    { path: "/stock", label: "Stock", icon: "📦", pageKey: "inventory" },
    { path: "/properties", label: "Properties", icon: "🏘️", pageKey: "inventory" },
    { path: "/shopping-list", label: "Shopping List", icon: "🛒", pageKey: "shopping-list", proOnly: true },
    { path: "/billing", label: "Billing", icon: "🧾", pageKey: "invoices" },
    { path: "/reports", label: "Reports", icon: "📊", pageKey: "reports" },
    { path: "/settings", label: "Settings", icon: "⚙️", pageKey: "settings" }
  ];

  const canSeePage = (item: { pageKey: string; proOnly?: boolean }) => {
    if (item.pageKey === "home") return true;
    if (!user) return false;
    if (item.proOnly && effectivePlan !== "pro") return false;
    if (user.teamRole === "owner") return true;
    if (!user.allowedPages || user.allowedPages.length === 0) return false;
    return user.allowedPages.includes(item.pageKey);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/dashboard" className="app-header-brand" style={{ textDecoration: "none", color: "inherit" }}>
          <img src="/logo.png" alt="StockStay" className="app-logo" />
          <div>
            <h1 className="brand-name">
              <span className="brand-stock">Stock</span>
              <span className="brand-stay">Stay</span>
            </h1>
          <p className="welcome-line">Welcome back, {user?.name?.trim() ? user.name.trim().split(/\s+/)[0] : "User"}</p>
          {memberships.length > 1 ? (
            <label className="team-line" style={{ display: "block" }}>
              <span className="sr-only">Active team</span>
              <select
                value={activeTeamId}
                disabled={switching}
                onChange={(e) => {
                  e.preventDefault();
                  void handleSwitchTeam(e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  marginTop: "2px",
                  maxWidth: "220px",
                  fontSize: "inherit",
                  fontWeight: 600,
                  border: "1px solid rgba(148, 163, 184, 0.5)",
                  borderRadius: "6px",
                  padding: "2px 6px",
                  background: "transparent",
                  color: "inherit",
                }}
              >
                {memberships.map((m) => (
                  <option key={m.teamId} value={m.teamId}>
                    {m.teamName || "Team"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="team-line">{displayTeamName}</p>
          )}
          </div>
        </Link>
        <button className="clear-button" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <nav className="main-nav">
        {navItems
          .filter((item) => canSeePage(item))
          .map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${
                location.pathname === item.path ? "active" : ""
              }`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
      </nav>

      {user && <OverLimitBanner teamKey={activeTeamId} />}

      <main>{children}</main>

      <footer className="app-footer">
        <button type="button" className="app-footer-link" onClick={openFeedback}>
          Send feedback
        </button>
        <span className="app-footer-sep" aria-hidden="true">
          ·
        </span>
        <Link to="/terms" className="app-footer-link">
          Terms
        </Link>
        <span className="app-footer-sep" aria-hidden="true">
          ·
        </span>
        <Link to="/privacy" className="app-footer-link">
          Privacy
        </Link>
      </footer>

      {showFeedback && (
        <div className="modal-overlay" onClick={() => !feedbackSending && setShowFeedback(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "440px", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>Send feedback</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => !feedbackSending && setShowFeedback(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
              Send us a message and we&apos;ll get back to you at support@stockstay.com.
            </p>
            {feedbackResult && (
              <p
                style={{
                  margin: "0 0 16px",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  backgroundColor: feedbackResult.ok ? "#dcfce7" : "#fee2e2",
                  color: feedbackResult.ok ? "#166534" : "#b91c1c",
                }}
              >
                {feedbackResult.message}
              </p>
            )}
            <form onSubmit={handleFeedbackSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Name</span>
                <input
                  type="text"
                  value={feedbackForm.name}
                  onChange={(e) => setFeedbackForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Your name"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)", boxSizing: "border-box" }}
                />
              </label>
              <label>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Email *</span>
                <input
                  type="email"
                  required
                  value={feedbackForm.email}
                  onChange={(e) => setFeedbackForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)", boxSizing: "border-box" }}
                />
              </label>
              <label>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Message *</span>
                <textarea
                  required
                  value={feedbackForm.message}
                  onChange={(e) => setFeedbackForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Ideas, bugs, or questions..."
                  rows={4}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)", resize: "vertical", boxSizing: "border-box" }}
                />
              </label>
              <div className="form-actions" style={{ marginTop: "4px" }}>
                <button type="button" className="secondary" onClick={() => !feedbackSending && setShowFeedback(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={feedbackSending}>
                  {feedbackSending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
