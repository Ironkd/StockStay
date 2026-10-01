import React, { useMemo, useState } from "react";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
import { useAuth } from "../contexts/useAuth";
import { useToast } from "../contexts/useToast";
import { useClients } from "../hooks/useClients";
import { Client } from "../types";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Icon,
  Modal,
  SectionHeader,
} from "../components/ui";

const PAGE_SIZE = 20;

const emptyClientForm = {
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
};

const getBillingFrequencyLabel = (billingFrequency?: Client["billingFrequency"]): string => {
  if (billingFrequency === "weekly") return "Weekly";
  if (billingFrequency === "biweekly") return "Biweekly";
  return "Monthly EOM";
};

export const ClientsPage: React.FC = () => {
  const { canWrite } = useAuth();
  const toast = useToast();
  const { clients, addClient, updateClient, removeClient } = useClients();
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState(emptyClientForm);

  const totalPages = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedClients = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return clients.slice(start, start + PAGE_SIZE);
  }, [clients, currentPage]);

  const closeForm = () => {
    setFormData(emptyClientForm);
    setEditingClient(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    setFormData(emptyClientForm);
    setEditingClient(null);
    setShowForm(true);
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
    closeForm();
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
      client.country,
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

      <Modal
        open={showForm && canWrite}
        onClose={closeForm}
        title={editingClient ? "Edit client" : "Add client"}
        maxWidth="760px"
      >
        <p className="modal-intro">
          {editingClient
            ? "Update billing details, markup defaults, and notes for this client."
            : "Add a client so you can assign properties and bill for supply usage."}
        </p>
        <form onSubmit={handleSubmit} className="stacked-form">
          <div className="form-grid client-form-grid">
            <FormField label="Name" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              )}
            </FormField>
            <FormField label="Email" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
              )}
            </FormField>
            <FormField label="Phone">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              )}
            </FormField>
            <FormField label="Company">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  value={formData.company}
                  onChange={(e) =>
                    setFormData({ ...formData, company: e.target.value })
                  }
                />
              )}
            </FormField>
          </div>

          <div className="client-address-field">
            <AddressAutocomplete
              label="Street address"
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
          </div>

          <div className="form-grid client-form-grid">
            <FormField label="City">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                />
              )}
            </FormField>
            <FormField label="Province/State">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  value={formData.province}
                  onChange={(e) =>
                    setFormData({ ...formData, province: e.target.value })
                  }
                />
              )}
            </FormField>
            <FormField label="Postal code">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) =>
                    setFormData({ ...formData, postalCode: e.target.value })
                  }
                />
              )}
            </FormField>
            <FormField label="Country">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="text"
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({ ...formData, country: e.target.value })
                  }
                />
              )}
            </FormField>
          </div>

          <div className="form-grid client-form-grid client-form-grid--compact">
            <FormField label="Default markup %">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="number"
                  step="any"
                  value={formData.defaultMarkupPercentage}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      defaultMarkupPercentage: e.target.value,
                    })
                  }
                />
              )}
            </FormField>
            <FormField label="Billing frequency">
              {(inputProps) => (
                <select
                  {...inputProps}
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
              )}
            </FormField>
          </div>

          <FormField label="Notes" className="notes-field">
            {(inputProps) => (
              <textarea
                {...inputProps}
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
              />
            )}
          </FormField>

          <div className="form-actions">
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit">
              {editingClient ? "Save Changes" : "Add Client"}
            </Button>
          </div>
        </form>
      </Modal>

      <SectionHeader
        title="Clients"
        description="Manage the people and companies you bill for stock usage."
        actions={
          canWrite ? (
            <Button onClick={openCreateForm}>Add Client</Button>
          ) : null
        }
      />

      <Card className="clients-list-card">
        <div className="clients-list-header">
          <h3>All clients</h3>
          <span className="clients-count">{clients.length}</span>
        </div>

        {clients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            body={
              canWrite
                ? "Add your first client to start billing for stock usage."
                : "Ask a team member with edit access to add clients."
            }
            primaryLabel={canWrite ? "Add Client" : undefined}
            onPrimary={canWrite ? openCreateForm : undefined}
          />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="inventory-table clients-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Contact</th>
                    <th>Billing frequency</th>
                    <th>Default markup</th>
                    {canWrite ? <th aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {pagedClients.map((client) => {
                    const clientAddress = formatAddress(client);
                    return (
                      <tr key={client.id}>
                        <td>
                          <div className="primary-cell">
                            <span className="primary-text">{client.name}</span>
                            {client.company ? (
                              <span className="secondary-text">{client.company}</span>
                            ) : null}
                            {client.notes ? (
                              <span className="client-table-note">{client.notes}</span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="primary-cell">
                            <span>{client.email}</span>
                            {client.phone ? (
                              <span className="secondary-text">{client.phone}</span>
                            ) : null}
                            {clientAddress ? (
                              <span className="secondary-text">{clientAddress}</span>
                            ) : null}
                          </div>
                        </td>
                        <td>{getBillingFrequencyLabel(client.billingFrequency)}</td>
                        <td>{Number(client.defaultMarkupPercentage ?? 0)}%</td>
                        {canWrite ? (
                          <td>
                            <div className="client-table-actions">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(client)}
                                title={`Edit ${client.name}`}
                                aria-label={`Edit ${client.name}`}
                              >
                                <Icon name="edit" size={16} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget(client)}
                                title={`Delete ${client.name}`}
                                aria-label={`Delete ${client.name}`}
                              >
                                <Icon name="delete" size={16} />
                              </Button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {clients.length > PAGE_SIZE && (
              <div className="pagination-controls">
                <Button
                  variant="secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <span className="pagination-status">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};
