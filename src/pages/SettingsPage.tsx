import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { useToast } from "../contexts/useToast";
import { apiRequest } from "../config/api";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Icon,
  Modal,
  SectionHeader,
  Tabs,
} from "../components/ui";
import { authApi } from "../services/authApi";
import { teamApi } from "../services/teamApi";
import { propertiesApi } from "../services/propertiesApi";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
import { track } from "../lib/analytics";
import type { TeamData, TeamMemberInfo, TeamInvitationInfo } from "../types";
import type { Property } from "../types";

const PAGE_KEYS = [
  { key: "home", label: "Home" },
  { key: "inventory", label: "Stock & Properties" },
  { key: "shopping-list", label: "Shopping List" },
  { key: "clients", label: "Clients" },
  { key: "invoices", label: "Billing" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
] as const;

const BILLING_TIMEZONES = [
  { value: "America/Toronto", label: "America/Toronto (Eastern)" },
  { value: "America/Winnipeg", label: "America/Winnipeg (Central)" },
  { value: "America/Edmonton", label: "America/Edmonton (Mountain)" },
  { value: "America/Vancouver", label: "America/Vancouver (Pacific)" },
  { value: "America/Halifax", label: "America/Halifax (Atlantic)" },
  { value: "America/St_Johns", label: "America/St_Johns (Newfoundland)" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Chicago", label: "America/Chicago" },
  { value: "America/Denver", label: "America/Denver" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "UTC", label: "UTC" },
] as const;

type AccessFormState = {
  teamRole: "member" | "viewer";
  allowedPages: string[];
  allowedPropertyIds: string[];
  maxInventoryItems: string;
};

type SettingsTab = "profile" | "organization" | "billing" | "client-facing" | "support";

type TransferOption = {
  key: string;
  label: string;
};

const emptyAccessForm: AccessFormState = {
  teamRole: "member",
  allowedPages: [],
  allowedPropertyIds: [],
  maxInventoryItems: "",
};

function toAllowedPages(arr: string[]): string[] | null {
  if (arr.length === 0) return null;
  return arr;
}

function toAllowedPropertyIds(arr: string[]): string[] | null {
  if (arr.length === 0) return null;
  return arr;
}

function toMaxInventoryItems(s: string): number | null {
  const n = parseInt(s, 10);
  if (s.trim() === "" || isNaN(n)) return null;
  return n;
}

function roleTone(role: string) {
  if (role === "owner") return "info" as const;
  if (role === "viewer") return "warning" as const;
  return "neutral" as const;
}

function invitationTone(status: string) {
  if (status === "pending") return "warning" as const;
  if (status === "accepted") return "success" as const;
  return "neutral" as const;
}

const AccessSelectionColumn: React.FC<{
  title: string;
  items: TransferOption[];
  emptyLabel: string;
  onSelect: (key: string) => void;
  mode: "add" | "remove";
}> = ({ title, items, emptyLabel, onSelect, mode }) => (
  <div className="settings-access-column">
    <span className="settings-access-label">{title}</span>
    <div className="settings-access-list" role="list">
      {items.length === 0 ? (
        <p className="settings-access-empty">{emptyLabel}</p>
      ) : (
        items.map((item) => (
          <Button
            key={item.key}
            variant="ghost"
            size="sm"
            type="button"
            className={`settings-access-item ${mode === "remove" ? "settings-access-item-remove" : "settings-access-item-add"}`}
            onClick={() => onSelect(item.key)}
          >
            {item.label}
          </Button>
        ))
      )}
    </div>
  </div>
);

export const SettingsPage: React.FC = () => {
  const { user, updateUser, refreshUser, switchTeam } = useAuth();
  const toast = useToast();
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [confirmAction, setConfirmAction] = useState<
    | { type: "revoke"; invitation: TeamInvitationInfo }
    | { type: "remove"; member: TeamMemberInfo }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [teamNameEdit, setTeamNameEdit] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [billingTimezoneEdit, setBillingTimezoneEdit] = useState("America/Toronto");
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [createTeamError, setCreateTeamError] = useState<string | null>(null);
  const [orgPanel, setOrgPanel] = useState<"overview" | "team">("overview");
  const [switchingTeam, setSwitchingTeam] = useState(false);
  const [orgNameEdit, setOrgNameEdit] = useState("");

  const [properties, setProperties] = useState<Property[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccess, setInviteAccess] = useState<AccessFormState>(emptyAccessForm);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const [editingMember, setEditingMember] = useState<TeamMemberInfo | null>(null);
  const [editingInvitation, setEditingInvitation] = useState<TeamInvitationInfo | null>(null);
  const [editAccess, setEditAccess] = useState<AccessFormState>(emptyAccessForm);
  const [editSaving, setEditSaving] = useState(false);

  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [extraUserSlotsLoading, setExtraUserSlotsLoading] = useState(false);
  const [extraUserSlotsError, setExtraUserSlotsError] = useState<string | null>(null);

  const [showOrgEditModal, setShowOrgEditModal] = useState(false);
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

  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportForm, setSupportForm] = useState({ name: "", email: "", message: "" });
  const [supportSending, setSupportSending] = useState(false);
  const [supportResult, setSupportResult] = useState<{ ok: boolean; message: string } | null>(null);

  const isTeamOwner = user?.teamRole === "owner";
  const isOrgOwner = Boolean(user?.isOrgOwner || teamData?.team?.isOrgOwner);
  const isOwner = isTeamOwner;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- granular fields avoid loops from updateUser()
  }, [user?.id, user?.firstName, user?.lastName, user?.email, user?.streetAddress, user?.city, user?.province, user?.postalCode, user?.phone]);

  useEffect(() => {
    if (showSupportModal && user) {
      setSupportForm({
        name: user.name?.trim() ?? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ?? "",
        email: user.email?.trim() ?? "",
        message: "",
      });
      setSupportResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open modal + identity fields only
  }, [showSupportModal, user?.id, user?.name, user?.firstName, user?.lastName, user?.email]);

  const loadTeam = async () => {
    setError(null);
    try {
      const data = await teamApi.getTeam();
      setTeamData(data);
      setTeamNameEdit(data.team.name);
      setBillingTimezoneEdit(data.team.billingTimezone || "America/Toronto");
      setOrgNameEdit(data.organization?.name ?? data.team.organizationName ?? "");
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
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!teamData || !user) return;
    const serverName = (teamData.team.name ?? "").trim();
    const authName = (user.teamName ?? "").trim();
    if (serverName && serverName !== authName) {
      refreshUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamData, user]);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    propertiesApi.getAll().then((list) => {
      if (!cancelled) setProperties(list);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  useEffect(() => {
    if (!teamData?.team || !showOrgEditModal) return;
    const t = teamData.team;
    const style = t.invoiceStyle ?? {};
    setOrgNameEdit(teamData.organization?.name ?? t.organizationName ?? "");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamData?.team?.id, teamData?.team?.name, teamData?.team?.invoiceLogoUrl, teamData?.team?.invoiceStyle, teamData?.organization?.name, teamData?.team?.organizationName, showOrgEditModal]);

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

  const handleSaveBillingTimezone = async () => {
    if (!teamData || !isOwner) return;
    const tz = billingTimezoneEdit.trim();
    if (!tz) return;
    setSavingTimezone(true);
    try {
      const { team } = await teamApi.updateBillingTimezone(tz);
      setTeamData((prev) =>
        prev
          ? {
              ...prev,
              team: {
                ...prev.team,
                billingTimezone: team.billingTimezone || tz,
              },
            }
          : null
      );
      setBillingTimezoneEdit(team.billingTimezone || tz);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save billing timezone");
    } finally {
      setSavingTimezone(false);
    }
  };

  const handleManageSubscription = async () => {
    setBillingLoading(true);
    setError(null);
    try {
      const { url } = await teamApi.getBillingPortalUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open billing portal";
      setError(msg);
      if (/load failed|request url|cors|vite_api_base_url/i.test(msg)) {
        setError(
          `${msg} If your app and API are on different domains, add this site's URL (${window.location.origin}) to the backend CORS_ORIGIN env var (e.g. on Railway: Variables → CORS_ORIGIN).`
        );
      }
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
        allowedPropertyIds: toAllowedPropertyIds(inviteAccess.allowedPropertyIds),
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

  const handleRevokeInvitation = (inv: TeamInvitationInfo) => {
    setConfirmAction({ type: "revoke", invitation: inv });
  };

  const handleRemoveMember = (member: TeamMemberInfo) => {
    setConfirmAction({ type: "remove", member });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmBusy(true);
    try {
      if (action.type === "revoke") {
        await teamApi.revokeInvitation(action.invitation.id);
        setTeamData((prev) =>
          prev
            ? {
                ...prev,
                invitations: prev.invitations.filter((i) => i.id !== action.invitation.id),
              }
            : null
        );
        toast.success("Invitation revoked");
      } else {
        await teamApi.removeMember(action.member.id);
        setTeamData((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.filter((m) => m.id !== action.member.id),
              }
            : null
        );
        setEditingMember(null);
        toast.success("Member removed");
      }
      setConfirmAction(null);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Action failed. Please try again."
      );
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleSaveInvoiceStyle = async () => {
    if (!teamData?.team || !isOrgOwner) return;
    setInvoiceStyleSaving(true);
    try {
      const nextOrgName = orgNameEdit.trim();
      const currentOrgName = (teamData.organization?.name ?? teamData.team.organizationName ?? "").trim();
      if (nextOrgName && nextOrgName !== currentOrgName) {
        const result = await teamApi.updateOrganizationName(nextOrgName);
        setTeamData((prev) =>
          prev
            ? {
                ...prev,
                organization: prev.organization
                  ? { ...prev.organization, name: result.organization.name }
                  : { id: result.organization.id, name: result.organization.name, owners: [] },
                team: {
                  ...prev.team,
                  organizationName: result.organization.name,
                },
              }
            : null
        );
      }
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
      setShowOrgEditModal(false);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to save organization");
    } finally {
      setInvoiceStyleSaving(false);
    }
  };

  const openTeamDetail = async (teamId: string) => {
    if (!teamData?.team) return;
    setSwitchingTeam(true);
    setError(null);
    try {
      if (teamId !== teamData.team.id) {
        await switchTeam(teamId);
      }
      await loadTeam();
      setOrgPanel("team");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open team");
    } finally {
      setSwitchingTeam(false);
    }
  };

  const openEditMember = (member: TeamMemberInfo) => {
    setEditingMember(member);
    setEditingInvitation(null);
    setEditAccess({
      teamRole: (member.teamRole === "viewer" ? "viewer" : "member") as "member" | "viewer",
      allowedPages: member.allowedPages ?? [],
      allowedPropertyIds: member.allowedPropertyIds ?? [],
      maxInventoryItems: member.maxInventoryItems != null ? String(member.maxInventoryItems) : "",
    });
  };

  const openEditInvitation = (invitation: TeamInvitationInfo) => {
    setEditingInvitation(invitation);
    setEditingMember(null);
    setEditAccess({
      teamRole: (invitation.teamRole === "viewer" ? "viewer" : "member") as "member" | "viewer",
      allowedPages: invitation.allowedPages ?? [],
      allowedPropertyIds: invitation.allowedPropertyIds ?? [],
      maxInventoryItems: invitation.maxInventoryItems != null ? String(invitation.maxInventoryItems) : "",
    });
  };

  const handleSaveEdit = async () => {
    if (editingMember) {
      setEditSaving(true);
      try {
        const updated = await teamApi.updateMember(editingMember.id, {
          teamRole: editAccess.teamRole,
          allowedPages: toAllowedPages(editAccess.allowedPages),
          allowedPropertyIds: toAllowedPropertyIds(editAccess.allowedPropertyIds),
          maxInventoryItems: toMaxInventoryItems(editAccess.maxInventoryItems),
        });
        setTeamData((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.map((member) =>
                  member.id === updated.id ? { ...member, ...updated } : member
                ),
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
          allowedPropertyIds: toAllowedPropertyIds(editAccess.allowedPropertyIds),
          maxInventoryItems: toMaxInventoryItems(editAccess.maxInventoryItems),
        });
        setTeamData((prev) =>
          prev
            ? {
                ...prev,
                invitations: prev.invitations.map((invitation) =>
                  invitation.id === updated.id ? { ...invitation, ...updated } : invitation
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

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupportResult(null);
    setSupportSending(true);
    try {
      await apiRequest<{ message: string }>("/contact", {
        method: "POST",
        body: JSON.stringify({
          name: supportForm.name.trim(),
          email: supportForm.email.trim(),
          message: supportForm.message.trim(),
        }),
      });
      setSupportResult({ ok: true, message: "Message sent. We'll get back to you soon." });
      track("feedback_sent", { source: "settings" });
      setSupportForm((form) => ({ ...form, message: "" }));
      setTimeout(() => {
        setShowSupportModal(false);
        setSupportResult(null);
      }, 2000);
    } catch (err) {
      setSupportResult({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to send. Please try again.",
      });
    } finally {
      setSupportSending(false);
    }
  };

  const saveProfile = async () => {
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
  };

  const openInviteModal = () => {
    setShowInviteModal(true);
    setLastInviteLink(null);
    setInviteError(null);
    setInviteAccess(emptyAccessForm);
  };

  const closeEditAccessModal = () => {
    setEditingMember(null);
    setEditingInvitation(null);
  };

  const closeSupportModal = () => {
    if (!supportSending) setShowSupportModal(false);
  };

  if (loading) {
    return (
      <div className="settings-page">
        <h2>Settings</h2>
        <div aria-busy="true" aria-label="Loading settings">
          <div className="skeleton skeleton-line medium" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-block" />
        </div>
      </div>
    );
  }

  if (error && !teamData) {
    const isLikelyBackend = /not found|404|failed to fetch|network error/i.test(error);
    return (
      <div className="settings-page">
        <SectionHeader title="Settings" />
        <p className="form-banner error">{error}</p>
        {isLikelyBackend ? (
          <p className="settings-error-note">
            If you&apos;re on production, the backend may need to be redeployed so that <code>/api/team</code> is available.
            Check that your API URL is correct and that the latest server is deployed.
          </p>
        ) : null}
      </div>
    );
  }

  const team = teamData?.team;
  const members = teamData?.members ?? [];
  const invitations = teamData?.invitations ?? [];
  const organizationTeams = team
    ? teamData?.organizationTeams ?? [{
        id: team.id,
        name: team.name,
        memberCount: members.length,
        isActive: true,
        isMember: true,
        myTeamRole: user?.teamRole,
      }]
    : [];

  const renderAccessForm = (
    access: AccessFormState,
    setAccess: React.Dispatch<React.SetStateAction<AccessFormState>>
  ) => {
    const availablePageOptions = PAGE_KEYS
      .filter(({ key }) => !access.allowedPages.includes(key))
      .map(({ key, label }) => ({ key, label }));
    const selectedPageOptions = access.allowedPages.map((key) => ({
      key,
      label: PAGE_KEYS.find((page) => page.key === key)?.label ?? key,
    }));
    const availablePropertyOptions = properties
      .filter((property) => !access.allowedPropertyIds.includes(property.id))
      .map((property) => ({ key: property.id, label: property.name }));
    const selectedPropertyOptions = access.allowedPropertyIds
      .map((id) => {
        const property = properties.find((item) => item.id === id);
        return property ? { key: property.id, label: property.name } : null;
      })
      .filter((option): option is TransferOption => option !== null);

    return (
      <>
        <FormField label="Role" required>
          {({ id, "aria-describedby": describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              value={access.teamRole}
              onChange={(e) =>
                setAccess((current) => ({
                  ...current,
                  teamRole: e.target.value as "member" | "viewer",
                }))
              }
            >
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          )}
        </FormField>

        <div className="settings-access-group">
          <div className="settings-access-grid">
            <AccessSelectionColumn
              title="Available"
              items={availablePageOptions}
              emptyLabel="All selected"
              mode="add"
              onSelect={(key) =>
                setAccess((current) => ({
                  ...current,
                  allowedPages: [...current.allowedPages, key],
                }))
              }
            />
            <AccessSelectionColumn
              title="Selected"
              items={selectedPageOptions}
              emptyLabel="None (full access)"
              mode="remove"
              onSelect={(key) =>
                setAccess((current) => ({
                  ...current,
                  allowedPages: current.allowedPages.filter((pageKey) => pageKey !== key),
                }))
              }
            />
          </div>
        </div>

        {properties.length > 0 ? (
          <div className="settings-access-group">
            <div className="settings-access-grid">
              <AccessSelectionColumn
                title="Available"
                items={availablePropertyOptions}
                emptyLabel="All selected"
                mode="add"
                onSelect={(key) =>
                  setAccess((current) => ({
                    ...current,
                    allowedPropertyIds: [...current.allowedPropertyIds, key],
                  }))
                }
              />
              <AccessSelectionColumn
                title="Selected"
                items={selectedPropertyOptions}
                emptyLabel="None (all properties)"
                mode="remove"
                onSelect={(key) =>
                  setAccess((current) => ({
                    ...current,
                    allowedPropertyIds: current.allowedPropertyIds.filter((id) => id !== key),
                  }))
                }
              />
            </div>
          </div>
        ) : null}

        <FormField label="Max inventory items (optional)">
          {({ id, "aria-describedby": describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              type="number"
              min={0}
              value={access.maxInventoryItems}
              onChange={(e) =>
                setAccess((current) => ({
                  ...current,
                  maxInventoryItems: e.target.value,
                }))
              }
              placeholder="No limit"
            />
          )}
        </FormField>
      </>
    );
  };

  const invoiceStyle = team?.invoiceStyle;

  return (
    <div className="settings-page">
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.type === "revoke" ? "Revoke invitation" : "Remove member"}
        message={
          confirmAction?.type === "revoke"
            ? `Revoke invitation for ${confirmAction.invitation.email}?`
            : "Remove this member from the team?"
        }
        confirmLabel={confirmAction?.type === "revoke" ? "Revoke" : "Remove"}
        danger
        busy={confirmBusy}
        onConfirm={() => {
          void handleConfirmAction();
        }}
        onCancel={() => {
          if (!confirmBusy) setConfirmAction(null);
        }}
      />

      <SectionHeader
        title="Settings"
      />

      {error ? <p className="form-banner error">{error}</p> : null}

      <Tabs
        items={[
          { key: "profile", label: "Profile" },
          { key: "organization", label: "Organization & Team", count: members.length + invitations.length },
          { key: "billing", label: "Billing & Plan" },
          { key: "client-facing", label: "Client-Facing" },
          { key: "support", label: "Support" },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as SettingsTab)}
      />

      <div className="settings-tab-panel">
        {activeTab === "profile" ? (
          <Card>
            <SectionHeader
              title="Profile"
              compact
            />
            {profileError ? <p className="form-banner error">{profileError}</p> : null}
            <form
              className="stacked-form settings-form settings-form-narrow"
              onSubmit={(e) => {
                e.preventDefault();
                void saveProfile();
              }}
            >
              <FormField label="First name">
                {({ id, "aria-describedby": describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="text"
                    value={profileFirstName}
                    onChange={(e) => setProfileFirstName(e.target.value)}
                    placeholder="First name"
                  />
                )}
              </FormField>
              <FormField label="Last name">
                {({ id, "aria-describedby": describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="text"
                    value={profileLastName}
                    onChange={(e) => setProfileLastName(e.target.value)}
                    placeholder="Last name"
                  />
                )}
              </FormField>
              <FormField label="Email">
                {({ id, "aria-describedby": describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    placeholder="your@email.com"
                  />
                )}
              </FormField>
              <FormField label="Street address">
                {({ id, "aria-describedby": describedBy }) => (
                  <AddressAutocomplete
                    id={id}
                    hideLabel
                    describedBy={describedBy}
                    value={profileStreet}
                    onChange={setProfileStreet}
                    placeholder="Street address or start typing to search"
                    onSelect={(address) => {
                      setProfileStreet(address.streetAddress);
                      setProfileCity(address.city);
                      setProfileProvince(address.province);
                      setProfilePostalCode(address.postalCode);
                    }}
                  />
                )}
              </FormField>
              <FormField label="City">
                {({ id, "aria-describedby": describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="text"
                    value={profileCity}
                    onChange={(e) => setProfileCity(e.target.value)}
                    placeholder="City"
                  />
                )}
              </FormField>
              <FormField label="Province">
                {({ id, "aria-describedby": describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="text"
                    value={profileProvince}
                    onChange={(e) => setProfileProvince(e.target.value)}
                    placeholder="Province"
                  />
                )}
              </FormField>
              <FormField label="Postal code">
                {({ id, "aria-describedby": describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="text"
                    value={profilePostalCode}
                    onChange={(e) => setProfilePostalCode(e.target.value)}
                    placeholder="Postal code"
                  />
                )}
              </FormField>
              <FormField label="Phone number">
                {({ id, "aria-describedby": describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="tel"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    placeholder="e.g. +1 234 567 8900"
                  />
                )}
              </FormField>
              <div className="form-actions">
                <Button type="submit" disabled={profileSaving}>
                  {profileSaving ? "Saving..." : "Save profile"}
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {activeTab === "organization" ? (
          team ? (
            orgPanel === "overview" ? (
              <>
                <Card>
                  <SectionHeader
                    title="Organization & Team"
                    compact
                    actions={
                      switchingTeam ? <span className="settings-inline-status">Opening team...</span> : undefined
                    }
                  />
                  <div className="settings-summary-card">
                    <div>
                      <p className="settings-summary-label">Organization</p>
                      <p className="settings-summary-title">
                        {teamData?.organization?.name ?? team.organizationName ?? "Organization"}
                      </p>
                    </div>
                    <div className="settings-summary-badges">
                      <Badge tone="info">{organizationTeams.length} teams</Badge>
                      <Badge tone="neutral">{members.length} members</Badge>
                    </div>
                  </div>
                  <ul className="settings-team-list">
                    {organizationTeams.map((organizationTeam) => (
                      <li key={organizationTeam.id}>
                        <Button
                          type="button"
                          variant="secondary"
                          className={`settings-team-button${organizationTeam.isActive ? " settings-team-button-active" : ""}`}
                          onClick={() => {
                            void openTeamDetail(organizationTeam.id);
                          }}
                          disabled={switchingTeam || organizationTeam.isMember === false}
                        >
                          <span className="settings-team-button-copy">
                            <span className="settings-team-button-row">
                              <span className="settings-team-button-name">{organizationTeam.name}</span>
                              <span className="settings-team-button-badges">
                                {organizationTeam.isActive ? <Badge tone="info">Current</Badge> : null}
                                {organizationTeam.isMember === false ? <Badge tone="warning">Invite required</Badge> : null}
                              </span>
                            </span>
                            <span className="settings-team-button-meta">
                              {typeof organizationTeam.memberCount === "number"
                                ? `${organizationTeam.memberCount} member${organizationTeam.memberCount === 1 ? "" : "s"}`
                                : ""}
                              {organizationTeam.myTeamRole ? ` · ${organizationTeam.myTeamRole}` : ""}
                              {organizationTeam.isMember === false ? " · not a member" : ""}
                            </span>
                            <span className="settings-team-button-link">
                              {organizationTeam.isMember === false ? "You need an invite to open this team" : "View and edit team details"}
                            </span>
                          </span>
                          <Icon name="chevron-right" size={16} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>

                {isOrgOwner && team.organizationId ? (
                  <Card>
                    <SectionHeader
                      title="Create team"
                      compact
                    />
                    {createTeamError ? <p className="form-banner error">{createTeamError}</p> : null}
                    <div className="settings-inline-form">
                      <FormField label="New team name" className="settings-inline-field">
                        {({ id, "aria-describedby": describedBy }) => (
                          <input
                            id={id}
                            aria-describedby={describedBy}
                            type="text"
                            value={newTeamName}
                            onChange={(e) => setNewTeamName(e.target.value)}
                            placeholder="New team name"
                          />
                        )}
                      </FormField>
                      <Button
                        type="button"
                        disabled={creatingTeam || !newTeamName.trim()}
                        onClick={async () => {
                          if (!team.organizationId || !newTeamName.trim()) return;
                          setCreatingTeam(true);
                          setCreateTeamError(null);
                          try {
                            const result = await teamApi.createOrganizationTeam(
                              team.organizationId,
                              newTeamName.trim()
                            );
                            updateUser(result.user);
                            setNewTeamName("");
                            await loadTeam();
                            setOrgPanel("team");
                            window.dispatchEvent(new Event("active-team-changed"));
                          } catch (err) {
                            setCreateTeamError(
                              err instanceof Error ? err.message : "Failed to create team"
                            );
                          } finally {
                            setCreatingTeam(false);
                          }
                        }}
                      >
                        {creatingTeam ? "Creating..." : "Create team"}
                      </Button>
                    </div>
                  </Card>
                ) : null}
              </>
            ) : (
              <>
                <Card>
                  <SectionHeader
                    title="Team details"
                    description={teamData?.organization?.name ?? team.organizationName}
                    compact
                    actions={
                      <Button type="button" variant="secondary" onClick={() => setOrgPanel("overview")}>
                        <Icon name="back" size={16} />
                        <span>Back</span>
                      </Button>
                    }
                  />
                  <div className="settings-detail-stack">
                    <div>
                      <div className="settings-inline-form">
                        <FormField label="Team name" className="settings-inline-field">
                          {({ id, "aria-describedby": describedBy }) =>
                            isTeamOwner ? (
                              <input
                                id={id}
                                aria-describedby={describedBy}
                                type="text"
                                value={teamNameEdit}
                                onChange={(e) => setTeamNameEdit(e.target.value)}
                                placeholder="Team name"
                              />
                            ) : (
                              <input
                                id={id}
                                aria-describedby={describedBy}
                                type="text"
                                value={team.name}
                                disabled
                                readOnly
                              />
                            )
                          }
                        </FormField>
                        {isTeamOwner ? (
                          <Button
                            type="button"
                            disabled={savingName || teamNameEdit.trim() === team.name}
                            onClick={() => {
                              void handleSaveTeamName();
                            }}
                          >
                            {savingName ? "Saving..." : "Save name"}
                          </Button>
                        ) : null}
                      </div>
                      <p className="settings-plan-summary">
                        Plan: <strong className="settings-capitalize">{team.effectivePlan}</strong>
                        {typeof team.propertyCount === "number"
                          ? ` · ${team.propertyCount} propert${team.propertyCount === 1 ? "y" : "ies"}`
                          : ""}
                      </p>
                    </div>

                    <div>
                      <div className="settings-inline-form">
                        <FormField
                          label="Billing timezone"
                          className="settings-inline-field"
                        >
                          {({ id, "aria-describedby": describedBy }) =>
                            isTeamOwner ? (
                              <select
                                id={id}
                                aria-describedby={describedBy}
                                value={billingTimezoneEdit}
                                onChange={(e) => setBillingTimezoneEdit(e.target.value)}
                              >
                                {BILLING_TIMEZONES.map((timezone) => (
                                  <option key={timezone.value} value={timezone.value}>
                                    {timezone.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id={id}
                                aria-describedby={describedBy}
                                type="text"
                                value={team.billingTimezone || "America/Toronto"}
                                disabled
                                readOnly
                              />
                            )
                          }
                        </FormField>
                        {isTeamOwner ? (
                          <Button
                            type="button"
                            disabled={
                              savingTimezone ||
                              billingTimezoneEdit === (team.billingTimezone || "America/Toronto")
                            }
                            onClick={() => {
                              void handleSaveBillingTimezone();
                            }}
                          >
                            {savingTimezone ? "Saving..." : "Save timezone"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionHeader
                    title="Team members"
                    compact
                    actions={
                      isOwner ? (
                        <Button type="button" onClick={openInviteModal}>
                          <Icon name="add" size={16} />
                          <span>Invite member</span>
                        </Button>
                      ) : undefined
                    }
                  />

                  {members.length === 0 && invitations.length === 0 ? (
                    <EmptyState
                      title="No members or invitations"
                      primaryLabel={isOwner ? "Invite member" : undefined}
                      onPrimary={isOwner ? openInviteModal : undefined}
                    />
                  ) : (
                    <div className="settings-list-stack">
                      <div>
                        <h3 className="settings-subsection-title">Accepted members</h3>
                        <ul className="settings-member-list">
                          {members.map((member) => (
                            <li key={member.id} className="settings-member-row">
                              <div className="settings-member-copy">
                                <p className="settings-member-name">
                                  {member.email ?? member.name ?? "Teammate"}
                                  {member.id === user?.id ? <span className="settings-member-you">(you)</span> : null}
                                </p>
                                <div className="settings-member-badges">
                                  <Badge tone={roleTone(member.teamRole)}>{member.teamRole}</Badge>
                                  <Badge tone="success">Accepted</Badge>
                                </div>
                              </div>
                              {isOwner && member.id !== user?.id ? (
                                <div className="settings-actions">
                                  <Button type="button" variant="secondary" onClick={() => openEditMember(member)}>
                                    Edit
                                  </Button>
                                  <Button type="button" variant="danger" onClick={() => handleRemoveMember(member)}>
                                    Remove
                                  </Button>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h3 className="settings-subsection-title">Pending invitations</h3>
                        {invitations.length === 0 ? (
                          <p className="settings-empty-note">No pending invitations.</p>
                        ) : (
                          <ul className="settings-member-list">
                            {invitations.map((invitation) => (
                              <li key={invitation.id} className="settings-member-row">
                                <div className="settings-member-copy">
                                  <p className="settings-member-name">{invitation.email}</p>
                                  <div className="settings-member-badges">
                                    <Badge tone={roleTone(invitation.teamRole)}>{invitation.teamRole}</Badge>
                                    <Badge tone={invitationTone(invitation.status)}>{invitation.status}</Badge>
                                  </div>
                                </div>
                                {isOwner && invitation.status === "pending" ? (
                                  <div className="settings-actions">
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      onClick={() => openEditInvitation(invitation)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="danger"
                                      onClick={() => handleRevokeInvitation(invitation)}
                                    >
                                      Revoke
                                    </Button>
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              </>
            )
          ) : (
            <Card>
              <EmptyState title="No team data" body="We couldn't load your team details." error />
            </Card>
          )
        ) : null}

        {activeTab === "billing" ? (
          team ? (
            <Card>
              <SectionHeader
                title="Billing & Plan"
                compact
              />
              <div className="settings-summary-card settings-summary-card-split">
                <div>
                  <p className="settings-summary-label">Organization</p>
                  <p className="settings-summary-title">
                    {teamData?.organization?.name ?? team.organizationName ?? "Organization"}
                  </p>
                </div>
                <div className="settings-summary-badges">
                  <Badge tone="info" className="settings-capitalize">{team.effectivePlan}</Badge>
                  {team.isOnTrial && team.trialStatus ? (
                    <Badge tone="warning">Trial ({team.trialStatus})</Badge>
                  ) : null}
                </div>
              </div>

              {isOrgOwner ? (
                <div className="settings-detail-stack">
                  <div className="settings-actions">
                    {team.billingPortalAvailable ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={billingLoading}
                        onClick={() => {
                          void handleManageSubscription();
                        }}
                      >
                        {billingLoading ? "Opening..." : "Manage subscription"}
                      </Button>
                    ) : null}
                    {team.effectivePlan === "free" || team.effectivePlan === "starter" ? (
                      <Button
                        type="button"
                        disabled={checkoutLoading}
                        onClick={() => {
                          void handleUpgrade();
                        }}
                      >
                        {checkoutLoading ? "Redirecting..." : "Upgrade to Pro"}
                      </Button>
                    ) : null}
                  </div>
                  {team.effectiveMaxUsers != null ? (
                    <div className="stats-list">
                      <div className="stat-item">
                        <span>Active team size</span>
                        <strong>
                          {members.length} of {team.effectiveMaxUsers} users
                        </strong>
                      </div>
                    </div>
                  ) : null}

                  {(team.effectivePlan === "starter" || team.effectivePlan === "pro") && team.effectiveMaxUsers != null ? (
                    <div className="settings-inline-form settings-inline-form-compact">
                      <FormField
                        label="Extra user slots"
                        className="settings-inline-field"
                      >
                        {({ id, "aria-describedby": describedBy }) => (
                          <select
                            id={id}
                            aria-describedby={describedBy}
                            value={team.extraUserSlots ?? 0}
                            disabled={extraUserSlotsLoading}
                            onChange={async (e) => {
                              const quantity = Number(e.target.value);
                              setExtraUserSlotsLoading(true);
                              setExtraUserSlotsError(null);
                              try {
                                await teamApi.updateExtraUserSlots(quantity);
                                await loadTeam();
                              } catch (err) {
                                setExtraUserSlotsError(
                                  err instanceof Error ? err.message : "Failed to update slots"
                                );
                              } finally {
                                setExtraUserSlotsLoading(false);
                              }
                            }}
                          >
                            {Array.from(
                              { length: (team.effectivePlan === "starter" ? 2 : 3) + 1 },
                              (_, index) => (
                                <option key={index} value={index}>
                                  {index}
                                </option>
                              )
                            )}
                          </select>
                        )}
                      </FormField>
                      {extraUserSlotsLoading ? (
                        <span className="settings-inline-status">Saving...</span>
                      ) : null}
                    </div>
                  ) : null}

                  {extraUserSlotsError ? <p className="form-banner error">{extraUserSlotsError}</p> : null}
                </div>
              ) : (
                <div className="settings-detail-stack">
                  {(teamData?.organization?.owners?.length ?? 0) > 0 ? (
                    <ul className="settings-owner-list">
                      {teamData?.organization?.owners.map((owner) => (
                        <li key={owner.id} className="settings-owner-row">
                          <div>
                            <p className="settings-member-name">{owner.name || "Admin"}</p>
                            {owner.email ? (
                              <a href={`mailto:${owner.email}`} className="settings-inline-link">
                                {owner.email}
                              </a>
                            ) : null}
                          </div>
                          <Badge tone="info">Admin</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </Card>
          ) : (
            <Card>
              <EmptyState title="No billing details" body="We couldn't load billing data for this team." error />
            </Card>
          )
        ) : null}

        {activeTab === "client-facing" ? (
          <>
            <Card>
              <SectionHeader
                title="Clients"
                compact
                actions={
                  <Link to="/clients" className="settings-link-button">
                    <span>Manage clients</span>
                    <Icon name="chevron-right" size={16} />
                  </Link>
                }
              />
            </Card>

            {team ? (
              <Card>
                <SectionHeader
                  title="Invoice style"
                  compact
                  actions={
                    isOrgOwner ? (
                      <Button type="button" variant="secondary" onClick={() => setShowOrgEditModal(true)}>
                        <Icon name="edit" size={16} />
                        <span>Edit</span>
                      </Button>
                    ) : undefined
                  }
                />
                <div className="settings-list-stack">
                  <div className="stats-list">
                    <div className="stat-item">
                      <span>Organization name</span>
                      <strong>{teamData?.organization?.name ?? team.organizationName ?? "—"}</strong>
                    </div>
                    <div className="stat-item">
                      <span>Company / brand name</span>
                      <strong>{invoiceStyle?.companyName ?? team.name ?? "—"}</strong>
                    </div>
                    <div className="stat-item">
                      <span>Sender email</span>
                      <strong>{invoiceStyle?.companyEmail ?? "—"}</strong>
                    </div>
                    <div className="stat-item">
                      <span>Footer text</span>
                      <strong>{invoiceStyle?.footerText ?? "— Stock Stay"}</strong>
                    </div>
                  </div>
                  <div className="settings-summary-badges">
                    <Badge tone="info">Primary {invoiceStyle?.primaryColor ?? "#2563eb"}</Badge>
                    <Badge tone="neutral">Accent {invoiceStyle?.accentColor ?? "#1e40af"}</Badge>
                    {team.invoiceLogoUrl ? <Badge tone="success">Logo configured</Badge> : null}
                  </div>
                </div>
              </Card>
            ) : null}
          </>
        ) : null}

        {activeTab === "support" ? (
          <Card>
            <SectionHeader
              title="Support"
              compact
              actions={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowSupportModal(true)}
                  aria-label="Open contact support form"
                >
                  Contact support
                </Button>
              }
            />
            <div className="settings-support-copy">
              <p>
                Use the contact form to reach the Stock Stay team about setup questions, billing help,
                feature feedback, or account issues.
              </p>
            </div>
          </Card>
        ) : null}
      </div>

      <Modal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite team member"
        maxWidth="520px"
      >
        <form onSubmit={handleInviteSubmit} className="stacked-form">
          <FormField label="Email" required>
            {({ id, "aria-describedby": describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                required
              />
            )}
          </FormField>
          {renderAccessForm(inviteAccess, setInviteAccess)}
          {inviteError ? <p className="form-banner error">{inviteError}</p> : null}
          {lastInviteLink ? (
            <div className="settings-copy-block">
              <FormField label="Invitation link">
                {({ id, "aria-describedby": describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="text"
                    readOnly
                    value={lastInviteLink}
                  />
                )}
              </FormField>
              <div className="settings-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(lastInviteLink);
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          ) : null}
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setShowInviteModal(false)}>
              {lastInviteLink ? "Done" : "Cancel"}
            </Button>
            {!lastInviteLink ? (
              <Button type="submit" disabled={inviteSubmitting}>
                {inviteSubmitting ? "Sending..." : "Send invitation"}
              </Button>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal
        open={showOrgEditModal}
        onClose={() => setShowOrgEditModal(false)}
        title="Edit organization"
        maxWidth="480px"
      >
        <div className="stacked-form">
          <FormField label="Organization name">
            {({ id, "aria-describedby": describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="text"
                value={orgNameEdit}
                onChange={(e) => setOrgNameEdit(e.target.value)}
                placeholder="Organization name"
              />
            )}
          </FormField>

          <div className="settings-divider" />
          <p className="settings-subsection-title">Invoice branding</p>

          <FormField label="Company / brand name">
            {({ id, "aria-describedby": describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="text"
                value={invoiceStyleForm.companyName}
                onChange={(e) =>
                  setInvoiceStyleForm((form) => ({ ...form, companyName: e.target.value }))
                }
                placeholder={team?.name ?? "Stock Stay"}
              />
            )}
          </FormField>
          <FormField label="Sender address (appears on invoice)">
            {({ id, "aria-describedby": describedBy }) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                value={invoiceStyleForm.companyAddress}
                onChange={(e) =>
                  setInvoiceStyleForm((form) => ({ ...form, companyAddress: e.target.value }))
                }
                placeholder={"123 Main St\nCity, Province A1B 2C3"}
                rows={3}
              />
            )}
          </FormField>
          <FormField label="Sender phone">
            {({ id, "aria-describedby": describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="text"
                value={invoiceStyleForm.companyPhone}
                onChange={(e) =>
                  setInvoiceStyleForm((form) => ({ ...form, companyPhone: e.target.value }))
                }
                placeholder="(555) 123-4567"
              />
            )}
          </FormField>
          <FormField label="Sender email">
            {({ id, "aria-describedby": describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="email"
                value={invoiceStyleForm.companyEmail}
                onChange={(e) =>
                  setInvoiceStyleForm((form) => ({ ...form, companyEmail: e.target.value }))
                }
                placeholder="billing@yourcompany.com"
              />
            )}
          </FormField>
          <FormField label="Logo URL">
            {({ id, "aria-describedby": describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="url"
                value={invoiceStyleForm.logoUrl}
                onChange={(e) =>
                  setInvoiceStyleForm((form) => ({ ...form, logoUrl: e.target.value }))
                }
                placeholder="https://example.com/logo.png"
              />
            )}
          </FormField>
          <div className="settings-color-grid">
            <FormField label="Primary color">
              {({ id, "aria-describedby": describedBy }) => (
                <div className="settings-color-field">
                  <input
                    id={`${id}-picker`}
                    type="color"
                    className="settings-color-picker"
                    value={invoiceStyleForm.primaryColor}
                    onChange={(e) =>
                      setInvoiceStyleForm((form) => ({ ...form, primaryColor: e.target.value }))
                    }
                    aria-label="Primary color picker"
                  />
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="text"
                    value={invoiceStyleForm.primaryColor}
                    onChange={(e) =>
                      setInvoiceStyleForm((form) => ({ ...form, primaryColor: e.target.value }))
                    }
                    placeholder="#2563eb"
                    className="settings-color-code"
                  />
                </div>
              )}
            </FormField>
            <FormField label="Accent color">
              {({ id, "aria-describedby": describedBy }) => (
                <div className="settings-color-field">
                  <input
                    id={`${id}-picker`}
                    type="color"
                    className="settings-color-picker"
                    value={invoiceStyleForm.accentColor}
                    onChange={(e) =>
                      setInvoiceStyleForm((form) => ({ ...form, accentColor: e.target.value }))
                    }
                    aria-label="Accent color picker"
                  />
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="text"
                    value={invoiceStyleForm.accentColor}
                    onChange={(e) =>
                      setInvoiceStyleForm((form) => ({ ...form, accentColor: e.target.value }))
                    }
                    placeholder="#1e40af"
                    className="settings-color-code"
                  />
                </div>
              )}
            </FormField>
          </div>
          <FormField label="Footer text">
            {({ id, "aria-describedby": describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="text"
                value={invoiceStyleForm.footerText}
                onChange={(e) =>
                  setInvoiceStyleForm((form) => ({ ...form, footerText: e.target.value }))
                }
                placeholder="— Stock Stay"
              />
            )}
          </FormField>
        </div>
        <div className="form-actions settings-modal-actions">
          <Button type="button" variant="secondary" onClick={() => setShowOrgEditModal(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={invoiceStyleSaving}
            onClick={() => {
              void handleSaveInvoiceStyle();
            }}
          >
            {invoiceStyleSaving ? "Saving..." : "Update"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={showSupportModal}
        onClose={closeSupportModal}
        title="Contact support"
        maxWidth="440px"
        busy={supportSending}
      >
        {supportResult ? (
          <p className={`form-banner ${supportResult.ok ? "success" : "error"}`}>
            {supportResult.message}
          </p>
        ) : null}
        <form onSubmit={handleSupportSubmit} className="stacked-form">
          <FormField label="Name">
            {({ id, "aria-describedby": describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="text"
                value={supportForm.name}
                onChange={(e) => setSupportForm((form) => ({ ...form, name: e.target.value }))}
                placeholder="Your name"
              />
            )}
          </FormField>
          <FormField label="Email" required>
            {({ id, "aria-describedby": describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="email"
                required
                value={supportForm.email}
                onChange={(e) => setSupportForm((form) => ({ ...form, email: e.target.value }))}
                placeholder="you@example.com"
              />
            )}
          </FormField>
          <FormField label="What are you looking for?" required>
            {({ id, "aria-describedby": describedBy }) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                required
                value={supportForm.message}
                onChange={(e) => setSupportForm((form) => ({ ...form, message: e.target.value }))}
                placeholder="Describe your question or issue..."
                rows={4}
              />
            )}
          </FormField>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={closeSupportModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={supportSending}>
              {supportSending ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingMember || editingInvitation)}
        onClose={closeEditAccessModal}
        title={editingMember ? "Edit member access" : "Edit invitation access"}
        maxWidth="520px"
      >
        {editingMember ? (
          <p className="modal-intro">{editingMember.email ?? editingMember.name ?? "Member"}</p>
        ) : null}
        {editingInvitation ? <p className="modal-intro">{editingInvitation.email}</p> : null}
        <div className="stacked-form">
          {renderAccessForm(editAccess, setEditAccess)}
        </div>
        <div className="form-actions settings-modal-actions">
          <Button type="button" variant="secondary" onClick={closeEditAccessModal}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={editSaving}
            onClick={() => {
              void handleSaveEdit();
            }}
          >
            {editSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </Modal>
    </div>
  );
};
