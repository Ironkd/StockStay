import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Client, Property, PropertyFormValues, StockLocation } from "../types";
import { useProperties } from "../hooks/useProperties";
import { useAuth } from "../contexts/useAuth";
import { useToast } from "../contexts/useToast";
import { PropertyForm } from "../components/PropertyForm";
import { teamApi } from "../services/teamApi";
import { clientsApi } from "../services/clientsApi";
import { stockLocationsApi } from "../services/stockLocationsApi";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Icon,
  Modal,
  SectionHeader,
} from "../components/ui";

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
            <Button onClick={handleAddProperty}>
              <Icon name="add" size={16} />
              Add property
            </Button>
          ) : null
        }
      />

      <Modal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Property limit reached"
        maxWidth="480px"
      >
        <p className="modal-intro">
          You can&apos;t add more properties on your current plan (limit: {maxProperties}). Upgrade your plan to unlock more properties.
        </p>
        <div className="form-actions">
          <Button variant="secondary" onClick={() => setShowUpgradeModal(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setShowUpgradeModal(false);
              navigate("/settings");
            }}
          >
            Upgrade your plan
          </Button>
        </div>
      </Modal>

      <Modal
        open={showPropertyModal}
        onClose={handleCancelPropertyEdit}
        title={editingProperty ? "Edit property" : "Add property"}
        maxWidth="720px"
      >
        <PropertyForm
          key={editingProperty ? editingProperty.id : "new"}
          initialValues={editingProperty ?? undefined}
          clients={clients}
          stockLocations={stockLocations}
          onSubmit={handlePropertySubmit}
          onCancel={handleCancelPropertyEdit}
        />
      </Modal>

      <Card>
        {visibleProperties.length === 0 ? (
          <EmptyState
            title="No properties yet"
            body="Add your first property to start replenishing and billing clients back."
            primaryLabel={canWrite ? "Add property" : undefined}
            onPrimary={canWrite ? handleAddProperty : undefined}
          />
        ) : (
          <div className="table-wrapper">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Location</th>
                  <th>Client</th>
                  <th>Linked stock locations</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleProperties.map((property) => (
                  <tr
                    key={property.id}
                    className="property-table-row"
                    onClick={() => navigate(`/properties/${property.id}`)}
                  >
                    <td>{property.name}</td>
                    <td>{property.location || "—"}</td>
                    <td>
                      {clientName(property.clientId) || (
                        <Badge tone="warning">No billing client</Badge>
                      )}
                    </td>
                    <td>{locationCountByProperty.get(property.id) || 0}</td>
                    <td>
                      {canWrite ? (
                        <div className="property-table-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit"
                            onClick={(e) => handleEditProperty(property, e)}
                          >
                            <Icon name="edit" size={16} />
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            title="Delete"
                            onClick={(e) => handleDeleteProperty(property, e)}
                          >
                            <Icon name="delete" size={16} />
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
