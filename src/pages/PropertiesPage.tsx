import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Client, Property, PropertyFormValues, StockLocation } from "../types";
import { useProperties } from "../hooks/useProperties";
import { useAuth } from "../contexts/useAuth";
import { useToast } from "../contexts/useToast";
import { PropertyForm } from "../components/PropertyForm";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { teamApi } from "../services/teamApi";
import { clientsApi } from "../services/clientsApi";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { SectionHeader } from "../components/ui/SectionHeader";

export const PropertiesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, canWrite } = useAuth();
  const toast = useToast();
  const {
    properties,
    addProperty,
    updateProperty,
    removeProperty,
    refresh: refreshProperties,
  } = useProperties();

  const [clients, setClients] = useState<Client[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [maxProperties, setMaxProperties] = useState<number>(1);
  const [teamLimitsLoaded, setTeamLimitsLoaded] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    clientsApi.getAll().then(setClients).catch(() => setClients([]));
    stockLocationsApi.getAll().then(setStockLocations).catch(() => setStockLocations([]));
    let cancelled = false;
    teamApi.getTeamLimits().then((data) => {
      if (!cancelled && data.effectiveMaxProperties != null) {
        setMaxProperties(data.effectiveMaxProperties);
        setTeamLimitsLoaded(true);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const visibleProperties = useMemo(() => {
    if (!user) return properties;
    if (user.teamRole === "owner") return properties;
    if (!user.allowedPropertyIds || user.allowedPropertyIds.length === 0) {
      return properties;
    }
    return properties.filter((p) => user.allowedPropertyIds!.includes(p.id));
  }, [user, properties]);

  const locationCountByProperty = useMemo(() => {
    const counts = new Map<string, number>();
    for (const loc of stockLocations) {
      for (const link of loc.properties || []) {
        counts.set(link.propertyId, (counts.get(link.propertyId) || 0) + 1);
      }
    }
    return counts;
  }, [stockLocations]);

  const clientName = (clientId?: string | null) =>
    clients.find((c) => c.id === clientId)?.name || null;

  const handleAddProperty = () => {
    if (teamLimitsLoaded && properties.length >= maxProperties) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingProperty(null);
    setShowPropertyModal(true);
  };

  const handleEditProperty = (property: Property, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingProperty(property);
    setShowPropertyModal(true);
  };

  const handleCancelPropertyEdit = () => {
    setEditingProperty(null);
    setShowPropertyModal(false);
  };

  const handlePropertySubmit = async (values: PropertyFormValues) => {
    try {
      if (editingProperty) {
        await updateProperty(editingProperty.id, values);
      } else {
        await addProperty(values);
      }
      setEditingProperty(null);
      setShowPropertyModal(false);
      await refreshProperties();
      stockLocationsApi.getAll().then(setStockLocations).catch(() => {});
    } catch {
      // Error already set in useProperties; keep modal open
    }
  };

  const handleDeleteProperty = (property: Property, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(property);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await removeProperty(deleteTarget.id);
      toast.success("Property deleted");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete property");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="inventory-page">
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete property"
        message={
          deleteTarget
            ? `Are you sure you want to delete the property "${deleteTarget.name}"?\n\nThis action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
      />
      <SectionHeader
        title="Properties"
        description="Deploy stock to properties and bill clients back for what they use."
        actions={
          canWrite ? (
            <button type="button" className="add-property-button" onClick={handleAddProperty}>
              + Add property
            </button>
          ) : null
        }
      />

      {showUpgradeModal && (
        <div className="modal-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3>Property limit reached</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => setShowUpgradeModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p style={{ marginBottom: "20px" }}>
              You can&apos;t add more properties on your current plan (limit: {maxProperties}). Click below to upgrade your plan and get more properties.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button type="button" className="secondary" onClick={() => setShowUpgradeModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setShowUpgradeModal(false);
                  navigate("/settings");
                }}
              >
                Upgrade your plan
              </button>
            </div>
          </div>
        </div>
      )}

      {showPropertyModal && (
        <div className="modal-overlay" onClick={handleCancelPropertyEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>{editingProperty ? "Edit Property" : "Add property"}</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={handleCancelPropertyEdit}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <PropertyForm
              key={editingProperty ? editingProperty.id : "new"}
              initialValues={editingProperty ?? undefined}
              clients={clients}
              stockLocations={stockLocations}
              onSubmit={handlePropertySubmit}
              onCancel={handleCancelPropertyEdit}
            />
          </div>
        </div>
      )}

      <section className="panel">
        {visibleProperties.length === 0 ? (
          <div className="empty-state">
            <h3>No properties yet</h3>
            <p>Add your first property to start replenishing and billing clients back.</p>
            <div style={{ marginTop: "12px" }}>
              {canWrite && (
                <button type="button" className="add-property-button" onClick={handleAddProperty}>
                  + Add property
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Location</th>
                  <th>Client</th>
                  <th>Linked stock locations</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleProperties.map((property) => (
                  <tr
                    key={property.id}
                    onClick={() => navigate(`/properties/${property.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{property.name}</td>
                    <td>{property.location || "—"}</td>
                    <td>
                      {clientName(property.clientId) || (
                        <span style={{ color: "#b45309" }}>No billing client</span>
                      )}
                    </td>
                    <td>{locationCountByProperty.get(property.id) || 0}</td>
                    <td>
                      {canWrite && (
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="icon-button"
                            title="Edit"
                            onClick={(e) => handleEditProperty(property, e)}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            title="Delete"
                            onClick={(e) => handleDeleteProperty(property, e)}
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
