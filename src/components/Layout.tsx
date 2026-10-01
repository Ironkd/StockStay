import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { teamApi } from "../services/teamApi";
import { apiRequest } from "../config/api";
import { track } from "../lib/analytics";
import { OverLimitBanner } from "./OverLimitBanner";
import { Icon, type IconName } from "./ui/Icon";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { FormField } from "./ui/FormField";

function userInitials(name?: string | null, email?: string | null): string {
  const trimmed = (name || "").trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  const mail = (email || "").trim();
  return mail ? mail.slice(0, 2).toUpperCase() : "?";
}

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
  const [navOpen, setNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const memberships = user?.memberships ?? [];
  const activeTeamId = user?.activeTeamId || user?.teamId || "";
  const canSeeSettings =
    !!user &&
    (user.teamRole === "owner" ||
      (!!user.allowedPages &&
        user.allowedPages.length > 0 &&
        user.allowedPages.includes("settings")));

  useEffect(() => {
    if (!user) {
      setHeaderTeamName(null);
      setEffectivePlan(null);
      return;
    }
    teamApi.getTeamName().then((r) => setHeaderTeamName(r.name)).catch(() => {});
    teamApi.getTeamLimits().then((r) => setEffectivePlan(r.effectivePlan)).catch(() => setEffectivePlan("free"));
    // Intentionally key off identity/team ids only — avoid refetching on every profile field edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user object identity churns on profile updates
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

  useEffect(() => {
    if (!profileOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen]);

  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

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
    setProfileOpen(false);
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

  const navItems: Array<{ path: string; label: string; icon: IconName; pageKey: string; proOnly?: boolean }> = [
    { path: "/dashboard", label: "Home", icon: "home", pageKey: "home" },
    { path: "/stock", label: "Stock", icon: "stock", pageKey: "inventory" },
    { path: "/properties", label: "Properties", icon: "properties", pageKey: "inventory" },
    { path: "/clients", label: "Clients", icon: "clients", pageKey: "clients" },
    { path: "/shopping-list", label: "Shopping List", icon: "shopping-list", pageKey: "shopping-list", proOnly: true },
    { path: "/billing", label: "Billing", icon: "billing", pageKey: "invoices" },
    { path: "/reports", label: "Reports", icon: "reports", pageKey: "reports" },
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
        <Link to="/dashboard" className="app-header-brand">
          <img src="/logo.png" alt="StockStay" className="app-logo" />
          <div>
            <h1 className="brand-name">
              <span className="brand-stock">Stock</span>
              <span className="brand-stay">Stay</span>
            </h1>
          <p className="welcome-line">Welcome back, {user?.name?.trim() ? user.name.trim().split(/\s+/)[0] : "User"}</p>
          {memberships.length > 1 ? (
            <label className="team-line team-switcher">
              <span className="sr-only">Active team</span>
              <select
                value={activeTeamId}
                disabled={switching}
                onChange={(e) => {
                  e.preventDefault();
                  void handleSwitchTeam(e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
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
        <div className="profile-menu" ref={profileRef}>
          <button
            type="button"
            className="profile-avatar"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label="Account menu"
            onClick={() => setProfileOpen((open) => !open)}
          >
            {userInitials(user?.name, user?.email)}
          </button>
          {profileOpen && (
            <div className="profile-dropdown" role="menu">
              {canSeeSettings && (
                <Link
                  to="/settings"
                  role="menuitem"
                  className="profile-dropdown-item"
                  onClick={() => setProfileOpen(false)}
                >
                  Settings
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                className="profile-dropdown-item danger"
                onClick={() => void handleLogout()}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <button
        type="button"
        className="nav-menu-toggle"
        onClick={() => setNavOpen((open) => !open)}
        aria-expanded={navOpen}
        aria-controls="main-nav"
      >
        {navOpen ? "Close menu" : "Menu"}
      </button>
      <nav id="main-nav" className={`main-nav${navOpen ? " nav-open" : ""}`}>
        {navItems
          .filter((item) => canSeePage(item))
          .map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${
                location.pathname === item.path ? "active" : ""
              }`}
              onClick={() => setNavOpen(false)}
            >
              <span className="nav-icon">
                <Icon name={item.icon} size={18} />
              </span>
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
        <Modal
          open={showFeedback}
          onClose={() => setShowFeedback(false)}
          title="Send feedback"
          busy={feedbackSending}
          maxWidth="440px"
        >
          <p className="modal-intro">
            Send us a message and we&apos;ll get back to you at support@stockstay.com.
          </p>
          {feedbackResult && (
            <p className={feedbackResult.ok ? "form-banner success" : "form-banner error"}>
              {feedbackResult.message}
            </p>
          )}
          <form onSubmit={handleFeedbackSubmit} className="stacked-form">
            <FormField label="Name">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  value={feedbackForm.name}
                  onChange={(e) => setFeedbackForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Your name"
                />
              )}
            </FormField>
            <FormField label="Email" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="email"
                  required
                  value={feedbackForm.email}
                  onChange={(e) => setFeedbackForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                />
              )}
            </FormField>
            <FormField label="Message" required>
              {(inputProps) => (
                <textarea
                  {...inputProps}
                  required
                  value={feedbackForm.message}
                  onChange={(e) => setFeedbackForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Ideas, bugs, or questions..."
                  rows={4}
                />
              )}
            </FormField>
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setShowFeedback(false)} disabled={feedbackSending}>
                Cancel
              </Button>
              <Button type="submit" disabled={feedbackSending}>
                {feedbackSending ? "Sending..." : "Send"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
