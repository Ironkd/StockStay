import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const navItems: Array<{ path: string; label: string; icon: string; pageKey: string }> = [
    { path: "/dashboard", label: "Home", icon: "🏠", pageKey: "home" },
    { path: "/inventory", label: "Inventory", icon: "📦", pageKey: "inventory" },
    { path: "/clients", label: "Clients", icon: "👥", pageKey: "clients" },
    { path: "/invoices", label: "Invoices", icon: "🧾", pageKey: "invoices" },
    { path: "/sales", label: "Sales", icon: "💰", pageKey: "sales" },
    { path: "/settings", label: "Settings", icon: "⚙️", pageKey: "settings" }
  ];

  const canSeePage = (pageKey: string) => {
    if (pageKey === "home") return true;
    if (!user) return false;
    if (!user.allowedPages || user.teamRole === "owner") return true;
    return user.allowedPages.includes(pageKey);
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
          {user?.teamName && <p className="team-line">{user.teamName}</p>}
          </div>
        </div>
        <button className="clear-button" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <nav className="main-nav">
        {navItems
          .filter((item) => canSeePage(item.pageKey))
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

