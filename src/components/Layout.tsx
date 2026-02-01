import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { teamApi } from "../services/teamApi";

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [headerTeamName, setHeaderTeamName] = useState<string | null>(null);
  const [effectivePlan, setEffectivePlan] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setHeaderTeamName(null);
      setEffectivePlan(null);
      return;
    }
    teamApi.getTeamName().then((r) => setHeaderTeamName(r.name)).catch(() => {});
    teamApi.getTeamLimits().then((r) => setEffectivePlan(r.effectivePlan)).catch(() => setEffectivePlan("free"));
  }, [user?.id]);

  useEffect(() => {
    const refetch = () =>
      teamApi.getTeamName().then((r) => setHeaderTeamName(r.name)).catch(() => {});
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("team-name-updated", refetch);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("team-name-updated", refetch);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const displayTeamName =
    (headerTeamName ?? user?.teamName ?? "").trim() ||
    (user?.name?.trim() ? `${user.name.trim().split(/\s+/)[0]}'s Team` : "My Team");

  const navItems: Array<{ path: string; label: string; icon: string; pageKey: string; proOnly?: boolean }> = [
    { path: "/dashboard", label: "Home", icon: "🏠", pageKey: "home" },
    { path: "/inventory", label: "Inventory", icon: "📦", pageKey: "inventory" },
    { path: "/shopping-list", label: "Shopping List", icon: "🛒", pageKey: "inventory", proOnly: true },
    { path: "/clients", label: "Clients", icon: "👥", pageKey: "clients" },
    { path: "/invoices", label: "Invoices", icon: "🧾", pageKey: "invoices" },
    { path: "/sales", label: "Sales", icon: "💰", pageKey: "sales" },
    { path: "/settings", label: "Settings", icon: "⚙️", pageKey: "settings" }
  ];

  const canSeePage = (item: { pageKey: string; proOnly?: boolean }) => {
    if (item.pageKey === "home") return true;
    if (!user) return false;
    if (item.proOnly && effectivePlan !== "pro") return false;
    if (user.teamRole === "owner") return true;
    // Invited members: only show pages the owner picked for them
    if (!user.allowedPages || user.allowedPages.length === 0) return false;
    return user.allowedPages.includes(item.pageKey);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <img src="/logo.png" alt="StockStay" className="app-logo" />
          <div>
            <h1 className="brand-name">
              <span className="brand-stock">Stock</span>
              <span className="brand-stay">Stay</span>
            </h1>
          <p className="welcome-line">Welcome back, {user?.name?.trim() ? user.name.trim().split(/\s+/)[0] : "User"}</p>
          <p className="team-line">{displayTeamName}</p>
          </div>
        </div>
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

