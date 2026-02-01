import React from "react";
import { useAuth } from "../contexts/AuthContext";

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <section style={{ marginBottom: "24px" }}>
        <h3 style={{ fontSize: "16px", marginBottom: "8px" }}>Profile</h3>
        <p style={{ color: "#64748b", margin: 0 }}>
          {user?.name && <strong>{user.name}</strong>}
          {user?.email && ` · ${user.email}`}
          {user?.teamRole && ` · ${user.teamRole}`}
        </p>
      </section>
      <section>
        <h3 style={{ fontSize: "16px", marginBottom: "8px" }}>Team & Billing</h3>
        <p style={{ color: "#64748b", margin: 0 }}>
          Manage your team and subscription from the app. More options coming soon.
        </p>
      </section>
    </div>
  );
};
