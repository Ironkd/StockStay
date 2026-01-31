import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useInventory } from "../hooks/useInventory";
import { useClients } from "../hooks/useClients";
import { useInvoices } from "../hooks/useInvoices";
import { useWarehouses } from "../hooks/useWarehouses";
import {
  teamApi,
  type TeamMember,
  type TeamInvitation
} from "../services/teamApi";

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const {
    items,
    clearAll: clearInventory,
    exportToJson: exportInventory
  } = useInventory();
  const { clients } = useClients();
  const { invoices } = useInvoices();
  const { warehouses } = useWarehouses();

  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");

  const [teamName, setTeamName] = useState<string>("");
  const [teamPlan, setTeamPlan] = useState<string>("free");
  const [teamMaxWarehouses, setTeamMaxWarehouses] = useState<number | null>(1);
  const [teamWarehouseCount, setTeamWarehouseCount] = useState<number>(0);
  const [billingPortalAvailable, setBillingPortalAvailable] = useState<boolean>(false);
  const [effectivePlan, setEffectivePlan] = useState<string>("free");
  const [isOnTrial, setIsOnTrial] = useState<boolean>(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [billingLoading, setBillingLoading] = useState<boolean>(false);
  const [billingError, setBillingError] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<"member" | "viewer">("member");
  const [inviteMaxInventory, setInviteMaxInventory] = useState<string>("");
  const [inviteLink, setInviteLink] = useState<string>("");
  const [invitePages, setInvitePages] = useState<string[]>([
    "inventory",
    "clients",
    "invoices",
    "sales"
  ]);
  const [inviteWarehouseIds, setInviteWarehouseIds] = useState<string[]>([]);
  const [teamLoading, setTeamLoading] = useState<boolean>(false);
  const [teamError, setTeamError] = useState<string>("");

  const isOwner = user?.teamRole === "owner";

  const availablePages = useMemo(
    () => [
      { key: "inventory", label: "Inventory" },
      { key: "clients", label: "Clients" },
      { key: "invoices", label: "Invoices" },
      { key: "sales", label: "Sales" },
      { key: "settings", label: "Settings" }
    ],
    []
  );

  const loadTeam = async () => {
    if (!user) return;
    try {
      setTeamLoading(true);
      setTeamError("");
      const response = await teamApi.getTeam();
      setTeamName(response.team.name);
      setTeamPlan(response.team.plan ?? "free");
      setTeamMaxWarehouses(
        typeof response.team.maxWarehouses === "number"
          ? response.team.maxWarehouses
          : response.team.plan === "free" || !response.team.plan
          ? 1
          : null
      );
      setTeamWarehouseCount(response.team.warehouseCount ?? 0);
      setBillingPortalAvailable(response.team.billingPortalAvailable ?? false);
      setEffectivePlan(response.team.effectivePlan ?? response.team.plan ?? "free");
      setIsOnTrial(response.team.isOnTrial ?? false);
      setMembers(response.members);
      setInvitations(response.invitations);
    } catch (error) {
      console.error("Error loading team:", error);
      setTeamError(
        error instanceof Error
          ? error.message
          : "Unable to load team information."
      );
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleExportAll = () => {
    const data = {
      inventory: items,
      clients,
      invoices,
      exportedAt: new Date().toISOString()
    };

    if (exportFormat === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // CSV export would go here
      alert("CSV export coming soon!");
    }
  };

  const handleClearAll = () => {
    if (
      window.confirm(
        "Are you sure you want to clear ALL data? This cannot be undone!"
      )
    ) {
      clearInventory();
      // Note: In a real app, you'd also clear clients and invoices
      alert("All inventory data has been cleared.");
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      const maxInventory =
        inviteMaxInventory.trim() === ""
          ? undefined
          : Number.parseInt(inviteMaxInventory, 10);

      const invitation = await teamApi.createInvitation({
        email: inviteEmail,
        teamRole: inviteRole,
        maxInventoryItems:
          typeof maxInventory === "number" && !Number.isNaN(maxInventory)
            ? maxInventory
            : undefined,
        // Home is always allowed; we only send non-home page keys
        allowedPages: invitePages.length > 0 ? invitePages : null,
        allowedWarehouseIds:
          inviteWarehouseIds.length > 0 ? inviteWarehouseIds : null
      });

      const url = `${window.location.origin}/accept-invite?token=${invitation.token}`;
      setInviteLink(url);
      setInviteEmail("");
      setInviteMaxInventory("");
      setInviteWarehouseIds([]);
      // Refresh invitations list
      loadTeam();
    } catch (error) {
      console.error("Error creating invitation:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Unable to create invitation. Please try again."
      );
    }
  };

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      <section className="panel">
        <h3>User Information</h3>
        <div className="settings-item">
          <label>Email</label>
          <input type="text" value={user?.email || ""} disabled />
        </div>
        <div className="settings-item">
          <label>Name</label>
          <input type="text" value={user?.name || ""} disabled />
        </div>
        {user?.teamRole && (
          <div className="settings-item">
            <label>Role</label>
            <input type="text" value={user.teamRole} disabled />
          </div>
        )}
        {typeof user?.maxInventoryItems === "number" && (
          <div className="settings-item">
            <label>Inventory Item Limit</label>
            <input
              type="text"
              value={
                user.maxInventoryItems === null
                  ? ""
                  : String(user.maxInventoryItems)
              }
              disabled
            />
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Plan &amp; Usage</h3>
        {teamLoading ? (
          <p>Loading plan information...</p>
        ) : teamError ? (
          <p>{teamError}</p>
        ) : (
          <>
            <div className="settings-item">
              <label>Current Plan</label>
              <input
                type="text"
                value={
                  teamPlan === "free"
                    ? "Free"
                    : teamPlan.charAt(0).toUpperCase() + teamPlan.slice(1)
                }
                disabled
              />
            </div>
            <div className="settings-item">
              <label>Warehouses</label>
              <input
                type="text"
                value={
                  teamMaxWarehouses === null
                    ? `${teamWarehouseCount} in use (unlimited)`
                    : `${teamWarehouseCount} of ${teamMaxWarehouses} in use`
                }
                disabled
              />
            </div>
            {isOwner && (effectivePlan === "free" || isOnTrial) && (
              <div style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  className="button primary"
                  disabled={billingLoading}
                  onClick={async () => {
                    setBillingError("");
                    setBillingLoading(true);
                    try {
                      const { url } = await teamApi.createCheckoutSession({ plan: "pro", billingPeriod: "monthly" });
                      if (url) window.location.href = url;
                    } catch (e) {
                      setBillingError(
                        e instanceof Error ? e.message : "Failed to start checkout."
                      );
                    } finally {
                      setBillingLoading(false);
                    }
                  }}
                >
                  {billingLoading ? "Loading…" : "Upgrade to Pro"}
                </button>
                {billingError && (
                  <p style={{ color: "var(--error)", fontSize: "0.9rem", marginTop: "8px" }}>
                    {billingError}
                  </p>
                )}
              </div>
            )}
            {isOwner && billingPortalAvailable && (
              <div style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  className="button secondary"
                  disabled={billingLoading}
                  onClick={async () => {
                    setBillingError("");
                    setBillingLoading(true);
                    try {
                      const { url } = await teamApi.createCustomerPortalSession();
                      if (url) window.location.href = url;
                    } catch (e) {
                      setBillingError(
                        e instanceof Error ? e.message : "Failed to open billing portal."
                      );
                    } finally {
                      setBillingLoading(false);
                    }
                  }}
                >
                  {billingLoading ? "Loading…" : "Manage subscription"}
                </button>
              </div>
            )}
            {teamPlan === "free" && !isOwner && (
              <p style={{ fontSize: "0.9rem", marginTop: "4px" }}>
                Free plan includes 1 warehouse. Team owners can upgrade to allow more.
              </p>
            )}
            {teamPlan === "free" && isOwner && !billingPortalAvailable && !billingError && (
              <p style={{ fontSize: "0.9rem", marginTop: "4px" }}>
                Free plan includes 1 warehouse. Upgrade to Pro for more warehouses and team features.
              </p>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h3>Team &amp; Access</h3>
        {teamLoading ? (
          <p>Loading team information...</p>
        ) : teamError ? (
          <p>{teamError}</p>
        ) : (
          <>
            <div className="settings-item">
              <label>Team Name</label>
              <input type="text" value={teamName} disabled />
            </div>

            <div className="settings-item">
              <label>Team Members</label>
              {members.length === 0 ? (
                <p>No members yet.</p>
              ) : (
                <ul>
                  {members.map((member) => (
                    <li key={member.id}>
                      {member.name} ({member.email}) – {member.teamRole}
                      {typeof member.maxInventoryItems === "number" &&
                        member.maxInventoryItems !== null && (
                          <> – Limit: {member.maxInventoryItems} items</>
                        )}
                      {Array.isArray(member.allowedPages) &&
                        member.allowedPages.length > 0 && (
                          <> – Pages: {member.allowedPages.join(", ")}</>
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isOwner && (
              <>
                <div className="settings-item">
                  <label>Pending Invitations</label>
                  {invitations.length === 0 ? (
                    <p>No invitations yet.</p>
                  ) : (
                    <ul>
                      {invitations.map((invitation) => (
                        <li key={invitation.id}>
                          {invitation.email} – {invitation.teamRole} –{" "}
                          {invitation.status}
                          {typeof invitation.maxInventoryItems === "number" &&
                            invitation.maxInventoryItems !== null && (
                              <> – Limit: {invitation.maxInventoryItems} items</>
                            )}
                          {Array.isArray(invitation.allowedPages) &&
                            invitation.allowedPages.length > 0 && (
                              <> – Pages: {invitation.allowedPages.join(", ")}</>
                            )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <form className="settings-item" onSubmit={handleInvite}>
                  <label>Invite New Member</label>
                  <input
                    type="email"
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                  <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(e.target.value as "member" | "viewer")
                      }
                    >
                      <option value="member">Member (edit access)</option>
                      <option value="viewer">Viewer (read-only)</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      placeholder="Max inventory items (optional)"
                      value={inviteMaxInventory}
                      onChange={(e) => setInviteMaxInventory(e.target.value)}
                    />
                  </div>
                  <div style={{ marginTop: "12px" }}>
                    <label style={{ display: "block", marginBottom: "4px" }}>
                      Page access (Home is always allowed)
                    </label>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px"
                      }}
                    >
                      {availablePages.map((page) => (
                        <label
                          key={page.key}
                          style={{ display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <input
                            type="checkbox"
                            checked={invitePages.includes(page.key)}
                            onChange={(e) => {
                              setInvitePages((prev) =>
                                e.target.checked
                                  ? [...prev, page.key]
                                  : prev.filter((p) => p !== page.key)
                              );
                            }}
                          />
                          <span>{page.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {warehouses.length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", marginBottom: "4px" }}>
                        Warehouse access (optional)
                      </label>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px"
                        }}
                      >
                        {warehouses.map((warehouse) => (
                          <label
                            key={warehouse.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={inviteWarehouseIds.includes(warehouse.id)}
                              onChange={(e) => {
                                setInviteWarehouseIds((prev) =>
                                  e.target.checked
                                    ? [...prev, warehouse.id]
                                    : prev.filter((id) => id !== warehouse.id)
                                );
                              }}
                            />
                            <span>{warehouse.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    type="submit"
                    className="clear-button"
                    style={{ marginTop: "8px" }}
                  >
                    Send Invitation
                  </button>
                  {inviteLink && (
                    <div style={{ marginTop: "8px" }}>
                      <label>Invitation Link</label>
                      <input type="text" readOnly value={inviteLink} />
                      <p style={{ fontSize: "0.85rem" }}>
                        Copy and share this link with the person you want to
                        invite.
                      </p>
                    </div>
                  )}
                </form>
              </>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h3>Data Management</h3>
        <div className="settings-item">
          <label>Export Format</label>
          <select
            value={exportFormat}
            onChange={(e) =>
              setExportFormat(e.target.value as "json" | "csv")
            }
          >
            <option value="json">JSON</option>
            <option value="csv">CSV (Coming Soon)</option>
          </select>
        </div>
        <div className="settings-actions">
          <button className="clear-button" onClick={handleExportAll}>
            Export All Data
          </button>
          <button
            className="clear-button"
            onClick={exportInventory}
            style={{ marginLeft: "8px" }}
          >
            Export Inventory Only
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>Statistics</h3>
        <div className="stats-list">
          <div className="stat-item">
            <span>Total Inventory Items:</span>
            <strong>{items.length}</strong>
          </div>
          <div className="stat-item">
            <span>Total Clients:</span>
            <strong>{clients.length}</strong>
          </div>
          <div className="stat-item">
            <span>Total Invoices:</span>
            <strong>{invoices.length}</strong>
          </div>
        </div>
      </section>

      <section className="panel danger-zone">
        <h3>Danger Zone</h3>
        <p>Permanently delete all data. This action cannot be undone.</p>
        <button
          className="clear-button"
          onClick={handleClearAll}
          style={{
            backgroundColor: "#ef4444",
            color: "white",
            borderColor: "#ef4444"
          }}
        >
          Clear All Inventory Data
        </button>
      </section>
    </div>
  );
};

