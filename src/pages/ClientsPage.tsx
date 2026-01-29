import React, { useState } from "react";
import { useClients } from "../hooks/useClients";
import { Client } from "../types";

export const ClientsPage: React.FC = () => {
  const { clients, addClient, updateClient, removeClient } = useClients();
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);

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
    notes: ""
  });

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
      notes: ""
    });
    setEditingClient(null);
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      alert("Name and email are required");
      return;
    }

    if (editingClient) {
      updateClient(editingClient.id, formData);
    } else {
      addClient(formData);
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
      notes: client.notes || ""
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this client?")) {
      removeClient(id);
    }
  };

  const formatAddress = (client: Client): string | null => {
    // If new address fields exist, format them
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

    // Fall back to old address field for backward compatibility
    return client.address || null;
  };

  return (
    <div className="clients-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h2>Clients</h2>
        <button
          className="clear-button"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Cancel" : "Add Client"}
        </button>
      </div>

      {showForm && (
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
            <div className="form-grid">
              <label>
                <span>Street Address</span>
                <input
                  type="text"
                  value={formData.streetAddress}
                  onChange={(e) =>
                    setFormData({ ...formData, streetAddress: e.target.value })
                  }
                />
              </label>
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
          <div className="empty-state">No clients yet. Add your first client above.</div>
        ) : (
          <div className="clients-grid">
            {clients.map((client) => (
              <div key={client.id} className="client-card">
                <div className="client-header">
                  <h4>{client.name}</h4>
                  <div className="client-actions">
                    <button
                      className="icon-button"
                      onClick={() => handleEdit(client)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => handleDelete(client.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="client-details">
                  <p>
                    <strong>Email:</strong> {client.email}
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
        )}
      </section>
    </div>
  );
};
