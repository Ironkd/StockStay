import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { teamApi } from "../services/teamApi";
import type { TeamData, TeamMemberInfo, TeamInvitationInfo } from "../types";

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [teamNameEdit, setTeamNameEdit] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "viewer">("member");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const isOwner = user?.teamRole === "owner";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await teamApi.getTeam();
        if (!cancelled) {
          setTeamData(data);
          setTeamNameEdit(data.team.name);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load team");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

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
      const inv = await teamApi.createInvitation({ email: inviteEmail.trim(), teamRole: inviteRole });
      const base = window.location.origin;
      const link = `${base}/accept-invite?token=${inv.token}`;
      setLastInviteLink(link);
      setTeamData((prev) =>
        prev ? { ...prev, invitations: [...prev.invitations, inv] } : null
      );
      setInviteEmail("");
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
    } catch (err) {
      console.error(err);
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

          <section className="panel" style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <h3 style={{ fontSize: "16px", margin: 0 }}>Team members</h3>
              {isOwner && (
                <button
                  type="button"
                  className="nav-button primary"
                  onClick={() => {
                    setShowInviteModal(true);
                    setLastInviteLink(null);
                    setInviteError(null);
                  }}
                >
                  Invite member
                </button>
              )}
            </div>
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
                  {isOwner && m.id !== user?.id && (
                    <button
                      type="button"
                      className="nav-button secondary"
                      onClick={() => handleRemoveMember(m)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {isOwner && pendingInvitations.length > 0 && (
            <section className="panel" style={{ marginBottom: "24px" }}>
              <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>Pending invitations</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {pendingInvitations.map((inv) => (
                  <li
                    key={inv.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid rgba(148,163,184,0.25)",
                    }}
                  >
                    <span style={{ color: "#64748b" }}>{inv.email} · {inv.teamRole}</span>
                    <button
                      type="button"
                      className="nav-button secondary"
                      onClick={() => handleRevokeInvitation(inv)}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "440px" }}>
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
              <div className="form-grid">
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
                <label>
                  <span>Role</span>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "member" | "viewer")}
                  >
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
              </div>
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
    </div>
  );
};
