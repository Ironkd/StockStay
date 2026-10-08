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
  ActionMenu,
} from "../components/ui";

export const PropertiesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, canWrite } = useAuth();
  const toast = useToast();
  const canManageProperties = canWrite && user?.teamRole === "owner";
  const {
    properties,
    addProperty,
    updateProperty,
    setPropertyArchived,
    refresh: refreshProperties,
  } = useProperties();

  const [clients, setClients] = useState<Client[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [maxProperties, setMaxProperties] = useState<number>(1);
  const [teamLimitsLoaded, setTeamLimitsLoaded] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Property | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

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
    const activePropertyCount = properties.filter((property) => !property.archivedAt).length;
    if (teamLimitsLoaded && activePropertyCount >= maxProperties) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingProperty(null);
    setShowPropertyModal(true);
  };

  const handleEditProperty = (property: Property) => {
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

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiveBusy(true);
    try {
      await setPropertyArchived(archiveTarget.id, true);
      toast.success("Property archived");
      setArchiveTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive property");
    } finally {
      setArchiveBusy(false);
    }
  };

  const handleRestoreProperty = async (property: Property) => {
    try {
      await setPropertyArchived(property.id, false);
      toast.success("Property restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore property");
    }
  };

  return (
    <div className="inventory-page">
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive property"
        message={
          archiveTarget
            ? `Archive "${archiveTarget.name}"? It will remain viewable with its audit and billing history, but cannot be changed or used for stock operations.`
            : ""
        }
        confirmLabel="Archive"
        danger
        busy={archiveBusy}
        onConfirm={() => {
          void handleConfirmArchive();
        }}
        onCancel={() => {
          if (!archiveBusy) setArchiveTarget(null);
        }}
      />

      <SectionHeader
        title="Properties"
        actions={
          canManageProperties ? (
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
            primaryLabel={canManageProperties ? "Add property" : undefined}
            onPrimary={canManageProperties ? handleAddProperty : undefined}
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
                  <th aria-label="Manage" />
                </tr>
              </thead>
              <tbody>
                {visibleProperties.map((property) => (
                  <tr
                    key={property.id}
                    className="property-table-row"
                    onClick={() => navigate(`/properties/${property.id}`)}
                  >
                    <td>
                      <span className="property-name-cell">
                        {property.name}
                        {property.archivedAt ? <Badge>Archived</Badge> : null}
                      </span>
                    </td>
                    <td>{property.location || "—"}</td>
                    <td>
                      {clientName(property.clientId) || (
                        <Badge tone="warning">No billing client</Badge>
                      )}
                    </td>
                    <td>{locationCountByProperty.get(property.id) || 0}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      {canManageProperties ? (
                        <div className="property-table-actions">
                          <ActionMenu
                            ariaLabel={`Manage ${property.name}`}
                            items={
                              property.archivedAt
                                ? [
                                    {
                                      label: "Restore property",
                                      onSelect: () => void handleRestoreProperty(property),
                                    },
                                  ]
                                : [
                                    {
                                      label: "Edit property",
                                      onSelect: () => handleEditProperty(property),
                                    },
                                    {
                                      label: "Archive property",
                                      onSelect: () => setArchiveTarget(property),
                                      danger: true,
                                    },
                                  ]
                            }
                          />
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
