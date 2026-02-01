import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { teamApi } from "../services/teamApi";
import { warehousesApi } from "../services/warehousesApi";
import type { TeamData, TeamMemberInfo, TeamInvitationInfo } from "../types";
import type { Warehouse } from "../types";

const PAGE_KEYS = [
  { key: "home", label: "Home" },
  { key: "inventory", label: "Inventory" },
  { key: "clients", label: "Clients" },
  { key: "invoices", label: "Invoices" },
  { key: "sales", label: "Sales" },
  { key: "settings", label: "Settings" },
] as const;

type AccessFormState = {
  teamRole: "member" | "viewer";
  allowedPages: string[];
  allowedWarehouseIds: string[];
  maxInventoryItems: string;
};

const emptyAccessForm: AccessFormState = {
  teamRole: "member",
  allowedPages: [],
  allowedWarehouseIds: [],
  maxInventoryItems: "",
};

function toAllowedPages(arr: string[]): string[] | null {
  if (arr.length === 0) return null;
  return arr;
}

function toAllowedWarehouseIds(arr: string[]): string[] | null {
  if (arr.length === 0) return null;
  return arr;
}

function toMaxInventoryItems(s: string): number | null {
  const n = parseInt(s, 10);
  if (s.trim() === "" || isNaN(n)) return null;
  return n;
}

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [teamNameEdit, setTeamNameEdit] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccess, setInviteAccess] = useState<AccessFormState>(emptyAccessForm);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const [showTeamList, setShowTeamList] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberInfo | null>(null);
  const [editingInvitation, setEditingInvitation] = useState<TeamInvitationInfo | null>(null);
  const [editAccess, setEditAccess] = useState<AccessFormState>(emptyAccessForm);
  const [editSaving, setEditSaving] = useState(false);

  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const isOwner = user?.teamRole === "owner";

  const loadTeam = async () => {
    setError(null);
    try {
      const data = await teamApi.getTeam();
      setTeamData(data);
      setTeamNameEdit(data.team.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      await loadTeam();
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    warehousesApi.getAll().then((list) => {
      if (!cancelled) setWarehouses(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isOwner]);

  const handleSaveTeamName = async () => {
    if (!teamData || !isOwner || teamNameEdit.trim() === teamData.team.name) return;
    setSavingName(true);
    try {
      const { team } = await teamApi.updateTeamName(teamNameEdit.trim());
      setTeamData((prev) =>
        prev ? { ...prev, team: { ...prev.team, name: team.name } } : null
      );
      setTeamNameEdit(team.name);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingName(false);
    }
  };

  const handleManageSubscription = async () => {
    setBillingLoading(true);
    try {
      const { url } = await teamApi.getBillingPortalUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal");
    } finally {
      setBillingLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      const { url } = await teamApi.createCheckoutSession({ plan: "pro", billingPeriod: "monthly" });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setCheckoutLoading(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteSubmitting(true);
    setInviteError(null);
    setLastInviteLink(null);
    try {
      const inv = await teamApi.createInvitation({
        email: inviteEmail.trim(),
        teamRole: inviteAccess.teamRole,
        allowedPages: toAllowedPages(inviteAccess.allowedPages),
        allowedWarehouseIds: toAllowedWarehouseIds(inviteAccess.allowedWarehouseIds),
        maxInventoryItems: toMaxInventoryItems(inviteAccess.maxInventoryItems),
      });
      const base = window.location.origin;
      const link = `${base}/accept-invite?token=${inv.token}`;
      setLastInviteLink(link);
      setTeamData((prev) =>
        prev ? { ...prev, invitations: [...prev.invitations, inv] } : null
      );
      setInviteEmail("");
      setInviteAccess(emptyAccessForm);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRevokeInvitation = async (inv: TeamInvitationInfo) => {
    if (!confirm(`Revoke invitation for ${inv.email}?`)) return;
    try {
      await teamApi.revokeInvitation(inv.id);
      setTeamData((prev) =>
        prev ? { ...prev, invitations: prev.invitations.filter((i) => i.id !== inv.id) } : null
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveMember = async (member: TeamMemberInfo) => {
    if (!confirm("Remove this member from the team?")) return;
    try {
      await teamApi.removeMember(member.id);
      setTeamData((prev) =>
        prev ? { ...prev, members: prev.members.filter((m) => m.id !== member.id) } : null
      );
      setEditingMember(null);
    } catch (err) {
      console.error(err);
    }
  };

  const openEditMember = (m: TeamMemberInfo) => {
    setEditingMember(m);
    setEditingInvitation(null);
    setEditAccess({
      teamRole: (m.teamRole === "viewer" ? "viewer" : "member") as "member" | "viewer",
      allowedPages: m.allowedPages ?? [],
      allowedWarehouseIds: m.allowedWarehouseIds ?? [],
      maxInventoryItems: m.maxInventoryItems != null ? String(m.maxInventoryItems) : "",
    });
  };

  const openEditInvitation = (inv: TeamInvitationInfo) => {
    setEditingInvitation(inv);
    setEditingMember(null);
    setEditAccess({
      teamRole: (inv.teamRole === "viewer" ? "viewer" : "member") as "member" | "viewer",
      allowedPages: inv.allowedPages ?? [],
      allowedWarehouseIds: inv.allowedWarehouseIds ?? [],
      maxInventoryItems: inv.maxInventoryItems != null ? String(inv.maxInventoryItems) : "",
    });
  };

  const handleSaveEdit = async () => {
    if (editingMember) {
      setEditSaving(true);
      try {
        const updated = await teamApi.updateMember(editingMember.id, {
          teamRole: editAccess.teamRole,
          allowedPages: toAllowedPages(editAccess.allowedPages),
          allowedWarehouseIds: toAllowedWarehouseIds(editAccess.allowedWarehouseIds),
          maxInventoryItems: toMaxInventoryItems(editAccess.maxInventoryItems),
        });
        setTeamData((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
              }
            : null
        );
        setEditingMember(null);
      } catch (err) {
        console.error(err);
      } finally {
        setEditSaving(false);
      }
    } else if (editingInvitation) {
      setEditSaving(true);
      try {
        const updated = await teamApi.updateInvitation(editingInvitation.id, {
          teamRole: editAccess.teamRole,
          allowedPages: toAllowedPages(editAccess.allowedPages),
          allowedWarehouseIds: toAllowedWarehouseIds(editAccess.allowedWarehouseIds),
          maxInventoryItems: toMaxInventoryItems(editAccess.maxInventoryItems),
        });
        setTeamData((prev) =>
          prev
            ? {
                ...prev,
                invitations: prev.invitations.map((i) =>
                  i.id === updated.id ? { ...i, ...updated } : i
                ),
              }
            : null
        );
        setEditingInvitation(null);
      } catch (err) {
        console.error(err);
      } finally {
        setEditSaving(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="settings-page">
        <h2>Settings</h2>
        <p style={{ color: "#64748b" }}>Loading...</p>
      </div>
    );
  }

  if (error && !teamData) {
    return (
      <div className="settings-page">
        <h2>Settings</h2>
        <p style={{ color: "#dc2626" }}>{error}</p>
      </div>
    );
  }

  const team = teamData?.team;
  const members = teamData?.members ?? [];
  const invitations = teamData?.invitations ?? [];
  const pendingInvitations = invitations.filter((i) => i.status === "pending");

  const renderAccessForm = (
    access: AccessFormState,
    setAccess: React.Dispatch<React.SetStateAction<AccessFormState>>
  ) => (
    <>
      <div style={{ marginBottom: "12px" }}>
        <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "6px" }}>
          Role
        </span>
        <select
          value={access.teamRole}
          onChange={(e) => setAccess((a) => ({ ...a, teamRole: e.target.value as "member" | "viewer" }))}
        >
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <div style={{ marginBottom: "12px" }}>
        <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "6px" }}>
          Pages they can view (leave all unchecked for full access)
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
          {PAGE_KEYS.map(({ key, label }) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={access.allowedPages.includes(key)}
                onChange={() =>
                  setAccess((a) => ({
                    ...a,
                    allowedPages: a.allowedPages.includes(key)
                      ? a.allowedPages.filter((k) => k !== key)
                      : [...a.allowedPages, key],
                  }))
                }
              />
              <span style={{ fontSize: "13px" }}>{label}</span>
            </label>
          ))}
        </div>
      </div>
      {warehouses.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "6px" }}>
            Warehouses they can access (leave all unchecked for all)
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
            {warehouses.map((w) => (
              <label key={w.id} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={access.allowedWarehouseIds.includes(w.id)}
                  onChange={() =>
                    setAccess((a) => ({
                      ...a,
                      allowedWarehouseIds: a.allowedWarehouseIds.includes(w.id)
                        ? a.allowedWarehouseIds.filter((id) => id !== w.id)
                        : [...a.allowedWarehouseIds, w.id],
                    }))
                }
              />
                <span style={{ fontSize: "13px" }}>{w.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginBottom: "12px" }}>
        <label>
          <span style={{ fontSize: "13px", color: "#64748b" }}>Max inventory items (optional)</span>
          <input
            type="number"
            min={0}
            value={access.maxInventoryItems}
            onChange={(e) => setAccess((a) => ({ ...a, maxInventoryItems: e.target.value }))}
            placeholder="No limit"
          />
        </label>
      </div>
    </>
  );

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      {error && <p style={{ color: "#dc2626", marginBottom: "12px" }}>{error}</p>}

      <section className="panel" style={{ marginBottom: "24px" }}>
        <h3 style={{ fontSize: "16px", marginBottom: "8px" }}>Profile</h3>
        <p style={{ color: "#64748b", margin: 0 }}>
          {user?.name && <strong>{user.name}</strong>}
          {user?.email && ` · ${user.email}`}
          {user?.teamRole && ` · ${user.teamRole}`}
        </p>
      </section>

      {team && (
        <>
          <section className="panel" style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>Team</h3>
            {isOwner ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={teamNameEdit}
                  onChange={(e) => setTeamNameEdit(e.target.value)}
                  placeholder="Team name"
                  style={{ maxWidth: "280px" }}
                />
                <button
                  type="button"
                  className="nav-button primary"
                  onClick={handleSaveTeamName}
                  disabled={savingName || teamNameEdit.trim() === team.name}
                >
                  {savingName ? "Saving..." : "Save name"}
                </button>
              </div>
            ) : (
              <p style={{ color: "#64748b", margin: 0 }}>{team.name}</p>
            )}
          </section>

          <section className="panel" style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>Plan & Billing</h3>
            <p style={{ color: "#64748b", margin: "0 0 12px 0" }}>
              Plan: <strong>{team.effectivePlan}</strong>
              {team.isOnTrial && team.trialEndsAt && (
                <> · Trial ends {new Date(team.trialEndsAt).toLocaleDateString()}</>
              )}
            </p>
            {isOwner && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {team.billingPortalAvailable && (
                  <button
                    type="button"
                    className="nav-button primary"
                    onClick={handleManageSubscription}
                    disabled={billingLoading}
                  >
                    {billingLoading ? "Opening..." : "Manage subscription"}
                  </button>
                )}
                {(team.effectivePlan === "free" || team.effectivePlan === "starter") && (
                  <button
                    type="button"
                    className="nav-button primary"
                    onClick={handleUpgrade}
                    disabled={checkoutLoading}
                  >
                    {checkoutLoading ? "Redirecting..." : "Upgrade to Pro"}
                  </button>
                )}
              </div>
            )}
          </section>

          {isOwner && (
            <section className="panel" style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h3 style={{ fontSize: "16px", margin: 0 }}>Team</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="nav-button primary"
                    onClick={() => {
                      setShowInviteModal(true);
                      setLastInviteLink(null);
                      setInviteError(null);
                      setInviteAccess(emptyAccessForm);
                    }}
                  >
                    Invite member
                  </button>
                  <button
                    type="button"
                    className="nav-button secondary"
                    onClick={() => setShowTeamList((v) => !v)}
                  >
                    {showTeamList ? "Hide team" : "See team"}
                  </button>
                </div>
              </div>

              {showTeamList && (
                <div style={{ marginTop: "16px" }}>
                  <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "12px" }}>
                    All members and pending invitations. You can edit access or remove/revoke.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {members.map((m) => (
                      <li
                        key={m.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 0",
                          borderBottom: "1px solid rgba(148,163,184,0.25)",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <span style={{ color: "#64748b" }}>
                          {m.email ?? m.name ?? "Teammate"} · {m.teamRole}
                          {m.id === user?.id && " (you)"}
                        </span>
                        <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 500 }}>Accepted</span>
                        {isOwner && (
                          <span style={{ display: "flex", gap: "8px" }}>
                            {m.id !== user?.id && (
                              <>
                                <button
                                  type="button"
                                  className="nav-button secondary"
                                  onClick={() => openEditMember(m)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="nav-button secondary"
                                  onClick={() => handleRemoveMember(m)}
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                    {invitations.map((inv) => (
                      <li
                        key={inv.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 0",
                          borderBottom: "1px solid rgba(148,163,184,0.25)",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <span style={{ color: "#64748b" }}>{inv.email} · {inv.teamRole}</span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: inv.status === "pending" ? "#f59e0b" : "#64748b",
                            fontWeight: 500,
                          }}
                        >
                          {inv.status === "pending" ? "Pending" : inv.status}
                        </span>
                        {isOwner && inv.status === "pending" && (
                          <span style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              className="nav-button secondary"
                              onClick={() => openEditInvitation(inv)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="nav-button secondary"
                              onClick={() => handleRevokeInvitation(inv)}
                            >
                              Revoke
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {members.length === 0 && invitations.length === 0 && (
                    <p style={{ color: "#64748b", fontSize: "13px", marginTop: "8px" }}>
                      No members or pending invitations. Use &quot;Invite member&quot; to add someone.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {!isOwner && (
            <section className="panel" style={{ marginBottom: "24px" }}>
              <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>Team members</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {members.map((m) => (
                  <li
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid rgba(148,163,184,0.25)",
                    }}
                  >
                    <span style={{ color: "#64748b" }}>
                      {m.email ?? m.name ?? "Teammate"} · {m.teamRole}
                      {m.id === user?.id && " (you)"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>Invite team member</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => setShowInviteModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleInviteSubmit} className="inventory-form">
              <div style={{ marginBottom: "16px" }}>
                <label>
                  <span>Email *</span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    required
                  />
                </label>
              </div>
              {renderAccessForm(inviteAccess, setInviteAccess)}
              {inviteError && <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "8px" }}>{inviteError}</p>}
              {lastInviteLink && (
                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Invitation link (share with invitee):</p>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="text"
                      readOnly
                      value={lastInviteLink}
                      style={{ fontSize: "12px", flex: 1 }}
                    />
                    <button
                      type="button"
                      className="nav-button secondary"
                      onClick={() => navigator.clipboard.writeText(lastInviteLink)}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowInviteModal(false)}>
                  {lastInviteLink ? "Done" : "Cancel"}
                </button>
                {!lastInviteLink && (
                  <button type="submit" disabled={inviteSubmitting}>
                    {inviteSubmitting ? "Sending..." : "Send invitation"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {(editingMember || editingInvitation) && (
        <div className="modal-overlay" onClick={() => { setEditingMember(null); setEditingInvitation(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>{editingMember ? "Edit member access" : "Edit invitation access"}</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => { setEditingMember(null); setEditingInvitation(null); }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {editingMember && (
              <p style={{ color: "#64748b", marginBottom: "12px" }}>
                {editingMember.email ?? editingMember.name ?? "Member"}
              </p>
            )}
            {editingInvitation && (
              <p style={{ color: "#64748b", marginBottom: "12px" }}>{editingInvitation.email}</p>
            )}
            {renderAccessForm(editAccess, setEditAccess)}
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => { setEditingMember(null); setEditingInvitation(null); }}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSaveEdit} disabled={editSaving}>
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
