import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../services/authApi";
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
  const { user, updateUser, refreshUser } = useAuth();
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

  const [showInvoiceStyleModal, setShowInvoiceStyleModal] = useState(false);
  const [invoiceStyleSaving, setInvoiceStyleSaving] = useState(false);
  const [invoiceStyleForm, setInvoiceStyleForm] = useState<{
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyEmail: string;
    primaryColor: string;
    accentColor: string;
    footerText: string;
    logoUrl: string;
  }>({
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
    primaryColor: "#2563eb",
    accentColor: "#1e40af",
    footerText: "— Stock Stay",
    logoUrl: "",
  });

  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileStreet, setProfileStreet] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [profileProvince, setProfileProvince] = useState("");
  const [profilePostalCode, setProfilePostalCode] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const isOwner = user?.teamRole === "owner";

  useEffect(() => {
    if (user) {
      setProfileFirstName(user.firstName ?? "");
      setProfileLastName(user.lastName ?? "");
      setProfileEmail(user.email ?? "");
      setProfileStreet(user.streetAddress ?? "");
      setProfileCity(user.city ?? "");
      setProfileProvince(user.province ?? "");
      setProfilePostalCode(user.postalCode ?? "");
      setProfilePhone(user.phone ?? "");
    }
  }, [user?.id, user?.firstName, user?.lastName, user?.email, user?.streetAddress, user?.city, user?.province, user?.postalCode, user?.phone]);

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
    if (!teamData || !user) return;
    const serverName = (teamData.team.name ?? "").trim();
    const authName = (user.teamName ?? "").trim();
    if (serverName && serverName !== authName) {
      refreshUser();
    }
  }, [teamData, user]);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    warehousesApi.getAll().then((list) => {
      if (!cancelled) setWarehouses(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isOwner]);

  // Sync invoice style form when team data or modal opens
  useEffect(() => {
    if (!teamData?.team || !showInvoiceStyleModal) return;
    const t = teamData.team;
    const style = t.invoiceStyle ?? {};
    setInvoiceStyleForm({
      companyName: (style.companyName ?? t.name ?? "").trim(),
      companyAddress: (style.companyAddress ?? "").trim(),
      companyPhone: (style.companyPhone ?? "").trim(),
      companyEmail: (style.companyEmail ?? "").trim(),
      primaryColor: (style.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(style.primaryColor)) ? style.primaryColor : "#2563eb",
      accentColor: (style.accentColor && /^#[0-9A-Fa-f]{6}$/.test(style.accentColor)) ? style.accentColor : "#1e40af",
      footerText: (style.footerText ?? "— Stock Stay").trim(),
      logoUrl: (t.invoiceLogoUrl ?? "").trim(),
    });
  }, [teamData?.team?.id, teamData?.team?.name, teamData?.team?.invoiceLogoUrl, teamData?.team?.invoiceStyle, showInvoiceStyleModal]);

  const handleSaveTeamName = async () => {
    if (!teamData || !isOwner) return;
    const newName = teamNameEdit.trim();
    if (!newName) return;
    setSavingName(true);
    try {
      if (newName !== teamData.team.name) {
        const { team } = await teamApi.updateTeamName(newName);
        setTeamData((prev) =>
          prev ? { ...prev, team: { ...prev.team, name: team.name } } : null
        );
        setTeamNameEdit(team.name);
        updateUser({ teamName: team.name });
      }
      await refreshUser();
      window.dispatchEvent(new CustomEvent("team-name-updated"));
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

  const handleSaveInvoiceStyle = async () => {
    if (!teamData?.team || !isOwner) return;
    setInvoiceStyleSaving(true);
    try {
      const { team } = await teamApi.updateInvoiceStyle({
        invoiceLogoUrl: invoiceStyleForm.logoUrl.trim() || null,
        invoiceStyle: {
          companyName: invoiceStyleForm.companyName.trim() || undefined,
          companyAddress: invoiceStyleForm.companyAddress.trim() || undefined,
          companyPhone: invoiceStyleForm.companyPhone.trim() || undefined,
          companyEmail: invoiceStyleForm.companyEmail.trim() || undefined,
          primaryColor: invoiceStyleForm.primaryColor.trim() || undefined,
          accentColor: invoiceStyleForm.accentColor.trim() || undefined,
          footerText: invoiceStyleForm.footerText.trim() || undefined,
        },
      });
      setTeamData((prev) =>
        prev
          ? {
              ...prev,
              team: {
                ...prev.team,
                invoiceLogoUrl: team.invoiceLogoUrl ?? undefined,
                invoiceStyle: team.invoiceStyle ?? undefined,
              },
            }
          : null
      );
      setShowInvoiceStyleModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setInvoiceStyleSaving(false);
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
          Pages they can view (click to add; leave Selected empty for full access)
        </span>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px", minWidth: "120px" }}>
            <span style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Available
            </span>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: "8px",
                border: "1px solid rgba(148, 163, 184, 0.7)",
                background: "rgba(248, 250, 252, 0.9)",
                minHeight: "120px",
                maxHeight: "180px",
                overflowY: "auto",
              }}
            >
              {PAGE_KEYS.filter(({ key }) => !access.allowedPages.includes(key)).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setAccess((a) => ({ ...a, allowedPages: [...a.allowedPages, key] }))
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "6px 8px",
                    margin: "2px 0",
                    textAlign: "left",
                    border: "none",
                    borderRadius: "6px",
                    background: "transparent",
                    fontSize: "13px",
                    cursor: "pointer",
                    color: "#334155",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {label}
                </button>
              ))}
              {PAGE_KEYS.filter(({ key }) => !access.allowedPages.includes(key)).length === 0 && (
                <p style={{ fontSize: "12px", color: "#94a3b8", margin: "8px 0", padding: "0 8px" }}>
                  All selected
                </p>
              )}
            </div>
          </div>
          <div style={{ flex: "1 1 140px", minWidth: "120px" }}>
            <span style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
              Selected
            </span>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: "8px",
                border: "1px solid rgba(148, 163, 184, 0.7)",
                background: "rgba(248, 250, 252, 0.9)",
                minHeight: "120px",
                maxHeight: "180px",
                overflowY: "auto",
              }}
            >
              {access.allowedPages.length === 0 && (
                <p style={{ fontSize: "12px", color: "#94a3b8", margin: "8px 0", padding: "0 8px" }}>
                  None (full access)
                </p>
              )}
              {access.allowedPages.map((key) => {
                const label = PAGE_KEYS.find((p) => p.key === key)?.label ?? key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setAccess((a) => ({
                        ...a,
                        allowedPages: a.allowedPages.filter((k) => k !== key),
                      }))
                    }
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "6px 8px",
                      margin: "2px 0",
                      textAlign: "left",
                      border: "none",
                      borderRadius: "6px",
                      background: "transparent",
                      fontSize: "13px",
                      cursor: "pointer",
                      color: "#334155",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {warehouses.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "6px" }}>
            Warehouses they can access (click to add; leave Selected empty for all)
          </span>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px", minWidth: "120px" }}>
              <span style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
                Available
              </span>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid rgba(148, 163, 184, 0.7)",
                  background: "rgba(248, 250, 252, 0.9)",
                  minHeight: "120px",
                  maxHeight: "180px",
                  overflowY: "auto",
                }}
              >
                {warehouses
                  .filter((w) => !access.allowedWarehouseIds.includes(w.id))
                  .map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() =>
                        setAccess((a) => ({ ...a, allowedWarehouseIds: [...a.allowedWarehouseIds, w.id] }))
                      }
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 8px",
                        margin: "2px 0",
                        textAlign: "left",
                        border: "none",
                        borderRadius: "6px",
                        background: "transparent",
                        fontSize: "13px",
                        cursor: "pointer",
                        color: "#334155",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {w.name}
                    </button>
                  ))}
                {warehouses.filter((w) => !access.allowedWarehouseIds.includes(w.id)).length === 0 && (
                  <p style={{ fontSize: "12px", color: "#94a3b8", margin: "8px 0", padding: "0 8px" }}>
                    All selected
                  </p>
                )}
              </div>
            </div>
            <div style={{ flex: "1 1 140px", minWidth: "120px" }}>
              <span style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>
                Selected
              </span>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid rgba(148, 163, 184, 0.7)",
                  background: "rgba(248, 250, 252, 0.9)",
                  minHeight: "120px",
                  maxHeight: "180px",
                  overflowY: "auto",
                }}
              >
                {access.allowedWarehouseIds.length === 0 && (
                  <p style={{ fontSize: "12px", color: "#94a3b8", margin: "8px 0", padding: "0 8px" }}>
                    None (all warehouses)
                  </p>
                )}
                {access.allowedWarehouseIds.map((id) => {
                  const w = warehouses.find((x) => x.id === id);
                  if (!w) return null;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() =>
                        setAccess((a) => ({
                          ...a,
                          allowedWarehouseIds: a.allowedWarehouseIds.filter((i) => i !== w.id),
                        }))
                      }
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 8px",
                        margin: "2px 0",
                        textAlign: "left",
                        border: "none",
                        borderRadius: "6px",
                        background: "transparent",
                        fontSize: "13px",
                        cursor: "pointer",
                        color: "#334155",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {w.name}
                    </button>
                  );
                })}
              </div>
            </div>
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
        <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>Profile</h3>
        {profileError && (
          <p style={{ color: "#dc2626", marginBottom: "12px", fontSize: "14px" }}>{profileError}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "400px" }}>
          <label>
            <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>First name</span>
            <input
              type="text"
              value={profileFirstName}
              onChange={(e) => setProfileFirstName(e.target.value)}
              placeholder="First name"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
            />
          </label>
          <label>
            <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Last name</span>
            <input
              type="text"
              value={profileLastName}
              onChange={(e) => setProfileLastName(e.target.value)}
              placeholder="Last name"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
            />
          </label>
          <label>
            <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Email</span>
            <input
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              placeholder="your@email.com"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
            />
          </label>
          <label>
            <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Street address</span>
            <input
              type="text"
              value={profileStreet}
              onChange={(e) => setProfileStreet(e.target.value)}
              placeholder="Street address"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
            />
          </label>
          <label>
            <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>City</span>
            <input
              type="text"
              value={profileCity}
              onChange={(e) => setProfileCity(e.target.value)}
              placeholder="City"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
            />
          </label>
          <label>
            <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Province</span>
            <input
              type="text"
              value={profileProvince}
              onChange={(e) => setProfileProvince(e.target.value)}
              placeholder="Province"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
            />
          </label>
          <label>
            <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Postal code</span>
            <input
              type="text"
              value={profilePostalCode}
              onChange={(e) => setProfilePostalCode(e.target.value)}
              placeholder="Postal code"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
            />
          </label>
          <label>
            <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Phone number</span>
            <input
              type="tel"
              value={profilePhone}
              onChange={(e) => setProfilePhone(e.target.value)}
              placeholder="e.g. +1 234 567 8900"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
            />
          </label>
          <button
            type="button"
            className="nav-button primary"
            onClick={async () => {
              setProfileError(null);
              setProfileSaving(true);
              try {
                const updated = await authApi.updateProfile({
                  firstName: profileFirstName.trim(),
                  lastName: profileLastName.trim(),
                  email: profileEmail.trim(),
                  streetAddress: profileStreet.trim(),
                  city: profileCity.trim(),
                  province: profileProvince.trim(),
                  postalCode: profilePostalCode.trim(),
                  phone: profilePhone.trim(),
                });
                updateUser(updated);
                await refreshUser();
              } catch (err) {
                setProfileError(err instanceof Error ? err.message : "Failed to update profile");
              } finally {
                setProfileSaving(false);
              }
            }}
            disabled={profileSaving}
          >
            {profileSaving ? "Saving..." : "Save profile"}
          </button>
        </div>
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
            {isOwner && (
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(148, 163, 184, 0.3)" }}>
                <button
                  type="button"
                  className="nav-button secondary"
                  onClick={() => setShowInvoiceStyleModal(true)}
                >
                  Edit invoice style
                </button>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "8px 0 0 0" }}>
                  Customize how emailed invoices look: company name, colors, logo, footer.
                </p>
              </div>
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

      {showInvoiceStyleModal && (
        <div className="modal-overlay" onClick={() => setShowInvoiceStyleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>Edit invoice style</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => setShowInvoiceStyleModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
              These settings apply to invoices sent by email. Add a logo URL (must be a public image link) and customize colors and text.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Company / brand name</span>
                <input
                  type="text"
                  value={invoiceStyleForm.companyName}
                  onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, companyName: e.target.value }))}
                  placeholder={team?.name ?? "Stock Stay"}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
                />
              </label>
              <label>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Sender address (appears on invoice)</span>
                <textarea
                  value={invoiceStyleForm.companyAddress}
                  onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, companyAddress: e.target.value }))}
                  placeholder="123 Main St&#10;City, Province A1B 2C3"
                  rows={3}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)", resize: "vertical" }}
                />
              </label>
              <label>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Sender phone</span>
                <input
                  type="text"
                  value={invoiceStyleForm.companyPhone}
                  onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, companyPhone: e.target.value }))}
                  placeholder="(555) 123-4567"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
                />
              </label>
              <label>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Sender email</span>
                <input
                  type="email"
                  value={invoiceStyleForm.companyEmail}
                  onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, companyEmail: e.target.value }))}
                  placeholder="billing@yourcompany.com"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
                />
              </label>
              <label>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Logo URL</span>
                <input
                  type="url"
                  value={invoiceStyleForm.logoUrl}
                  onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://example.com/logo.png"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
                />
              </label>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 120px" }}>
                  <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Primary color</span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="color"
                      value={invoiceStyleForm.primaryColor}
                      onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, primaryColor: e.target.value }))}
                      style={{ width: "40px", height: "36px", padding: 0, border: "1px solid rgba(148, 163, 184, 0.7)", borderRadius: "8px", cursor: "pointer" }}
                    />
                    <input
                      type="text"
                      value={invoiceStyleForm.primaryColor}
                      onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, primaryColor: e.target.value }))}
                      placeholder="#2563eb"
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)", fontFamily: "monospace", fontSize: "13px" }}
                    />
                  </div>
                </label>
                <label style={{ flex: "1 1 120px" }}>
                  <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Accent color</span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="color"
                      value={invoiceStyleForm.accentColor}
                      onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, accentColor: e.target.value }))}
                      style={{ width: "40px", height: "36px", padding: 0, border: "1px solid rgba(148, 163, 184, 0.7)", borderRadius: "8px", cursor: "pointer" }}
                    />
                    <input
                      type="text"
                      value={invoiceStyleForm.accentColor}
                      onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, accentColor: e.target.value }))}
                      placeholder="#1e40af"
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)", fontFamily: "monospace", fontSize: "13px" }}
                    />
                  </div>
                </label>
              </div>
              <label>
                <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "4px" }}>Footer text</span>
                <input
                  type="text"
                  value={invoiceStyleForm.footerText}
                  onChange={(e) => setInvoiceStyleForm((f) => ({ ...f, footerText: e.target.value }))}
                  placeholder="— Stock Stay"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.7)" }}
                />
              </label>
            </div>
            <div className="form-actions" style={{ marginTop: "20px" }}>
              <button type="button" className="secondary" onClick={() => setShowInvoiceStyleModal(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSaveInvoiceStyle} disabled={invoiceStyleSaving}>
                {invoiceStyleSaving ? "Saving..." : "Update"}
              </button>
            </div>
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
