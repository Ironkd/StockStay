import React, { useMemo, useState } from "react";
import { useClients } from "../hooks/useClients";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Client } from "../types";
import { useAuth } from "../contexts/useAuth";
import { useToast } from "../contexts/useToast";
import { SectionHeader } from "../components/ui/SectionHeader";

const PAGE_SIZE = 20;

export const ClientsPage: React.FC = () => {
  const { canWrite } = useAuth();
  const toast = useToast();
  const { clients, addClient, updateClient, removeClient } = useClients();
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    streetAddress: "",
    city: "",
    province: "",
    postalCode: "",
    country: "",
    company: "",
    notes: "",
    defaultMarkupPercentage: "0",
    billingFrequency: "monthly_eom" as "weekly" | "biweekly" | "monthly_eom",
  });

  const totalPages = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedClients = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return clients.slice(start, start + PAGE_SIZE);
  }, [clients, currentPage]);

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      streetAddress: "",
      city: "",
      province: "",
      postalCode: "",
      country: "",
      company: "",
      notes: "",
      defaultMarkupPercentage: "0",
      billingFrequency: "monthly_eom",
    });
    setEditingClient(null);
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      toast.error("Name and email are required");
      return;
    }

    const payload = {
      ...formData,
      defaultMarkupPercentage: Number(formData.defaultMarkupPercentage) || 0,
    };

    if (editingClient) {
      updateClient(editingClient.id, payload);
      toast.success("Client updated");
    } else {
      addClient(payload);
      toast.success("Client added");
    }
    resetForm();
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address || "",
      streetAddress: client.streetAddress || "",
      city: client.city || "",
      province: client.province || "",
      postalCode: client.postalCode || "",
      country: client.country || "",
      company: client.company || "",
      notes: client.notes || "",
      defaultMarkupPercentage: String(client.defaultMarkupPercentage ?? 0),
      billingFrequency: client.billingFrequency || "monthly_eom",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    removeClient(deleteTarget.id);
    toast.success("Client deleted");
    setDeleteTarget(null);
  };

  const formatAddress = (client: Client): string | null => {
    const addressParts = [
      client.streetAddress,
      client.city,
      client.province,
      client.postalCode,
      client.country
    ].filter(Boolean);

    if (addressParts.length > 0) {
      return addressParts.join(", ");
    }

    return client.address || null;
  };

  return (
    <div className="clients-page">
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete client"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"?`
            : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <SectionHeader
        title="Clients"
        description="Manage the people and companies you bill for stock usage."
        actions={
          canWrite ? (
            <button
              className="clear-button"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
            >
              {showForm ? "Cancel" : "Add Client"}
            </button>
          ) : null
        }
      />

      {showForm && canWrite && (
        <section className="panel">
          <h3>{editingClient ? "Edit Client" : "Add New Client"}</h3>
          <form onSubmit={handleSubmit} className="inventory-form">
            <div className="form-grid">
              <label>
                <span>Name *</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Email *</span>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Phone</span>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Company</span>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) =>
                    setFormData({ ...formData, company: e.target.value })
                  }
                />
              </label>
            </div>
            <AddressAutocomplete
              label="Street Address"
              value={formData.streetAddress}
              onChange={(v) => setFormData({ ...formData, streetAddress: v })}
              placeholder="Street address or start typing to search"
              onSelect={(addr) => {
                setFormData({
                  ...formData,
                  streetAddress: addr.streetAddress,
                  city: addr.city,
                  province: addr.province,
                  postalCode: addr.postalCode,
                  country: addr.country ?? formData.country,
                });
              }}
            />
            <div className="form-grid">
              <label>
                <span>City</span>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Province/State</span>
                <input
                  type="text"
                  value={formData.province}
                  onChange={(e) =>
                    setFormData({ ...formData, province: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Postal Code</span>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) =>
                    setFormData({ ...formData, postalCode: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Country</span>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({ ...formData, country: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="notes-field">
              <span>Notes</span>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
              />
            </label>
            <div className="form-grid">
              <label>
                <span>Default markup %</span>
                <input
                  type="number"
                  step="any"
                  value={formData.defaultMarkupPercentage}
                  onChange={(e) =>
                    setFormData({ ...formData, defaultMarkupPercentage: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Billing frequency</span>
                <select
                  value={formData.billingFrequency}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      billingFrequency: e.target.value as typeof formData.billingFrequency,
                    })
                  }
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly_eom">Monthly (end of month)</option>
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit">
                {editingClient ? "Save Changes" : "Add Client"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <h3>All Clients ({clients.length})</h3>
        {clients.length === 0 ? (
          <div className="empty-state">
            {canWrite
              ? "No clients yet. Add your first client above."
              : "No clients yet. Ask a team member with edit access to add clients."}
          </div>
        ) : (
          <>
            <div className="clients-grid">
              {pagedClients.map((client) => (
                <div key={client.id} className="client-card">
                  <div className="client-header">
                    <h4>{client.name}</h4>
                    <div className="client-actions">
                      {canWrite && (
                        <>
                          <button
                            className="icon-button"
                            onClick={() => handleEdit(client)}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            className="icon-button"
                            onClick={() => setDeleteTarget(client)}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="client-details">
                    <p>
                      <strong>Email:</strong> {client.email}
                    </p>
                    <p>
                      <strong>Default markup:</strong>{" "}
                      {Number(client.defaultMarkupPercentage ?? 0)}%
                    </p>
                    <p>
                      <strong>Billing:</strong>{" "}
                      {client.billingFrequency === "weekly"
                        ? "Weekly"
                        : client.billingFrequency === "biweekly"
                          ? "Biweekly"
                          : "Monthly EOM"}
                    </p>
                    {client.phone && (
                      <p>
                        <strong>Phone:</strong> {client.phone}
                      </p>
                    )}
                    {client.company && (
                      <p>
                        <strong>Company:</strong> {client.company}
                      </p>
                    )}
                    {formatAddress(client) && (
                      <p>
                        <strong>Address:</strong> {formatAddress(client)}
                      </p>
                    )}
                    {client.notes && (
                      <p className="client-notes">{client.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {clients.length > PAGE_SIZE && (
              <div className="pagination-controls">
                <button
                  type="button"
                  className="secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span className="pagination-status">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
