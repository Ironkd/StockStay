import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { teamApi } from "../services/teamApi";

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const { user, logout, switchTeam } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [headerTeamName, setHeaderTeamName] = useState<string | null>(null);
  const [effectivePlan, setEffectivePlan] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

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

      <main>{children}</main>

      <footer className="app-footer">
        <span>Connected to backend API</span>
      </footer>
    </div>
  );
};
