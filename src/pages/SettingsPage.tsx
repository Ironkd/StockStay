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
  const { items, clearAll: clearInventory } = useInventory();
  const { clients } = useClients();
  const { invoices } = useInvoices();
  const { warehouses } = useWarehouses();

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
  const [billingInterval, setBillingInterval] = useState<string | null>(null);
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

  const [manageTeamModalOpen, setManageTeamModalOpen] = useState<boolean>(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editingInvitation, setEditingInvitation] = useState<TeamInvitation | null>(null);
  const [editRole, setEditRole] = useState<"member" | "viewer">("member");
  const [editMaxInventory, setEditMaxInventory] = useState<string>("");
  const [editPages, setEditPages] = useState<string[]>([]);
  const [editWarehouseIds, setEditWarehouseIds] = useState<string[]>([]);
  const [manageTeamError, setManageTeamError] = useState<string>("");
  const [manageTeamSaving, setManageTeamSaving] = useState<boolean>(false);
  const [teamNameSaving, setTeamNameSaving] = useState<boolean>(false);
  const [teamNameError, setTeamNameError] = useState<string>("");

  const isOwner = user?.teamRole === "owner";

  const formatCurrentPlan = (plan: string, interval: string | null, onTrial: boolean) => {
    if (plan === "free") return "Free";
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    if (onTrial) return `${planLabel} (trial)`;
    const intervalLabel = interval === "year" ? "Annual" : interval === "month" ? "Monthly" : null;
    return intervalLabel ? `${planLabel} (${intervalLabel})` : planLabel;
  };

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
      setBillingInterval(response.team.billingInterval ?? null);
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

  const openEditMember = (member: TeamMember) => {
    setEditingMember(member);
    setEditingInvitation(null);
    setEditRole(member.teamRole === "viewer" ? "viewer" : "member");
    setEditMaxInventory(
      typeof member.maxInventoryItems === "number" ? String(member.maxInventoryItems) : ""
    );
    setEditPages(Array.isArray(member.allowedPages) ? [...member.allowedPages] : []);
    setEditWarehouseIds(
      Array.isArray(member.allowedWarehouseIds) ? [...member.allowedWarehouseIds] : []
    );
    setManageTeamError("");
  };

  const openEditInvitation = (invitation: TeamInvitation) => {
    setEditingInvitation(invitation);
    setEditingMember(null);
    setEditRole(invitation.teamRole === "viewer" ? "viewer" : "member");
    setEditMaxInventory(
      typeof invitation.maxInventoryItems === "number"
        ? String(invitation.maxInventoryItems)
        : ""
    );
    setEditPages(Array.isArray(invitation.allowedPages) ? [...invitation.allowedPages] : []);
    setEditWarehouseIds(
      Array.isArray(invitation.allowedWarehouseIds) ? [...invitation.allowedWarehouseIds] : []
    );
    setManageTeamError("");
  };

  const cancelEdit = () => {
    setEditingMember(null);
    setEditingInvitation(null);
    setManageTeamError("");
  };

  const saveEdit = async () => {
    setManageTeamError("");
    setManageTeamSaving(true);
    try {
      if (editingMember) {
        const maxInventory =
          editMaxInventory.trim() === ""
            ? null
            : Number.parseInt(editMaxInventory, 10);
        await teamApi.updateMember(editingMember.id, {
          teamRole: editRole,
          maxInventoryItems:
            typeof maxInventory === "number" && !Number.isNaN(maxInventory)
              ? maxInventory
              : null,
          allowedPages: editPages.length > 0 ? editPages : null,
          allowedWarehouseIds: editWarehouseIds.length > 0 ? editWarehouseIds : null,
        });
        setEditingMember(null);
      } else if (editingInvitation) {
        const maxInventory =
          editMaxInventory.trim() === ""
            ? null
            : Number.parseInt(editMaxInventory, 10);
        await teamApi.updateInvitation(editingInvitation.id, {
          teamRole: editRole,
          maxInventoryItems:
            typeof maxInventory === "number" && !Number.isNaN(maxInventory)
              ? maxInventory
              : null,
          allowedPages: editPages.length > 0 ? editPages : null,
          allowedWarehouseIds: editWarehouseIds.length > 0 ? editWarehouseIds : null,
        });
        setEditingInvitation(null);
      }
      await loadTeam();
    } catch (error) {
      setManageTeamError(
        error instanceof Error ? error.message : "Failed to save. Please try again."
      );
    } finally {
      setManageTeamSaving(false);
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.name || member.email} from the team?`)) return;
    try {
      await teamApi.removeMember(member.id);
      await loadTeam();
      if (editingMember?.id === member.id) cancelEdit();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to remove member.");
    }
  };

  const handleRevokeInvitation = async (invitation: TeamInvitation) => {
    if (!window.confirm(`Revoke invitation for ${invitation.email}?`)) return;
    try {
      await teamApi.revokeInvitation(invitation.id);
      await loadTeam();
      if (editingInvitation?.id === invitation.id) cancelEdit();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to revoke invitation.");
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
              <label>Current plan</label>
              <input
                type="text"
                value={formatCurrentPlan(teamPlan, billingInterval, isOnTrial)}
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
            {isOwner && (
              <div style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  className="button primary"
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
                <p style={{ fontSize: "0.9rem", color: "#64748b", marginTop: "8px" }}>
                  Upgrade, change billing (monthly or yearly), cancel, or downgrade to Starter or Free — all in the Stripe portal.
                </p>
                {billingError && (
                  <p style={{ color: "var(--error)", fontSize: "0.9rem", marginTop: "8px" }}>
                    {billingError}
                  </p>
                )}
              </div>
            )}
            {teamPlan === "free" && !isOwner && (
              <p style={{ fontSize: "0.9rem", marginTop: "4px" }}>
                Free plan includes 1 warehouse. Team owners can upgrade to allow more.
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
              {isOwner ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Team name"
                    style={{ flex: "1 1 200px" }}
                  />
                  <button
                    type="button"
                    className="button primary"
                    disabled={teamNameSaving}
                    onClick={async () => {
                      const trimmed = teamName.trim();
                      if (!trimmed) {
                        setTeamNameError("Team name is required");
                        return;
                      }
                      setTeamNameError("");
                      setTeamNameSaving(true);
                      try {
                        await teamApi.updateTeamName(trimmed);
                        setTeamName(trimmed);
                      } catch (err) {
                        setTeamNameError(err instanceof Error ? err.message : "Failed to save team name");
                      } finally {
                        setTeamNameSaving(false);
                      }
                    }}
                  >
                    {teamNameSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <input type="text" value={teamName} disabled />
              )}
              {teamNameError && (
                <p style={{ color: "var(--error)", fontSize: "0.9rem", marginTop: "8px" }}>
                  {teamNameError}
                </p>
              )}
              {isOwner && (
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                  This name is visible to everyone on the team.
                </p>
              )}
            </div>

            {isOwner && (
              <div className="settings-item" style={{ marginBottom: "12px" }}>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setManageTeamModalOpen(true);
                    cancelEdit();
                  }}
                >
                  Manage team
                </button>
              </div>
            )}

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
                          className="settings-checkbox-row"
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
                            className="settings-checkbox-row"
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

      {manageTeamModalOpen && isOwner && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            if (!editingMember && !editingInvitation) setManageTeamModalOpen(false);
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "var(--bg)",
              padding: "24px",
              borderRadius: "8px",
              maxWidth: "560px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>Manage team</h3>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setManageTeamModalOpen(false);
                  cancelEdit();
                }}
              >
                Close
              </button>
            </div>

            {(editingMember || editingInvitation) ? (
              <>
                <p style={{ marginBottom: "12px", color: "var(--text-secondary)" }}>
                  {editingMember
                    ? `Edit access for ${editingMember.name || editingMember.email}`
                    : `Edit invitation for ${editingInvitation?.email}`}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px" }}>Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as "member" | "viewer")}
                    >
                      <option value="member">Member (edit access)</option>
                      <option value="viewer">Viewer (read-only)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px" }}>
                      Max inventory items (optional)
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="Unlimited"
                      value={editMaxInventory}
                      onChange={(e) => setEditMaxInventory(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px" }}>
                      Page access (Home is always allowed)
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {availablePages.map((page) => (
                        <label key={page.key} className="settings-checkbox-row">
                          <input
                            type="checkbox"
                            checked={editPages.includes(page.key)}
                            onChange={(e) => {
                              setEditPages((prev) =>
                                e.target.checked ? [...prev, page.key] : prev.filter((p) => p !== page.key)
                              );
                            }}
                          />
                          <span>{page.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {warehouses.length > 0 && (
                    <div>
                      <label style={{ display: "block", marginBottom: "4px" }}>
                        Warehouse access (optional)
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {warehouses.map((warehouse) => (
                          <label key={warehouse.id} className="settings-checkbox-row">
                            <input
                              type="checkbox"
                              checked={editWarehouseIds.includes(warehouse.id)}
                              onChange={(e) => {
                                setEditWarehouseIds((prev) =>
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
                </div>
                {manageTeamError && (
                  <p style={{ color: "var(--error)", fontSize: "0.9rem", marginTop: "8px" }}>
                    {manageTeamError}
                  </p>
                )}
                <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                  <button
                    type="button"
                    className="button primary"
                    disabled={manageTeamSaving}
                    onClick={saveEdit}
                  >
                    {manageTeamSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="button secondary" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: "16px" }}>
                  <strong>Team members</strong>
                  {members.length === 0 ? (
                    <p style={{ margin: "8px 0 0", color: "var(--text-secondary)" }}>No members yet.</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                      {members.map((member) => (
                        <li
                          key={member.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 0",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          <span>
                            {member.name || member.email} ({member.email}) – {member.teamRole}
                            {member.teamRole === "owner" && " (you)"}
                          </span>
                          {member.teamRole !== "owner" && (
                            <span style={{ display: "flex", gap: "8px" }}>
                              <button
                                type="button"
                                className="button secondary"
                                style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                                onClick={() => openEditMember(member)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="button"
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "0.85rem",
                                  backgroundColor: "var(--error)",
                                  color: "white",
                                  border: "none",
                                }}
                                onClick={() => handleRemoveMember(member)}
                              >
                                Remove
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <strong>Pending invitations</strong>
                  {invitations.length === 0 ? (
                    <p style={{ margin: "8px 0 0", color: "var(--text-secondary)" }}>No pending invitations.</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                      {invitations.map((invitation) => (
                        <li
                          key={invitation.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 0",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          <span>
                            {invitation.email} – {invitation.teamRole} – {invitation.status}
                          </span>
                          <span style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              className="button secondary"
                              style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                              onClick={() => openEditInvitation(invitation)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="button"
                              style={{
                                padding: "4px 8px",
                                fontSize: "0.85rem",
                                backgroundColor: "var(--error)",
                                color: "white",
                                border: "none",
                              }}
                              onClick={() => handleRevokeInvitation(invitation)}
                            >
                              Revoke
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

