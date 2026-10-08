import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  Client,
  PropertyFormValues,
  PropertySupplyItem,
  Replenishment,
  StockLocation,
  SupplyItem,
  UnbilledLine,
} from "../types";
import { useProperties } from "../hooks/useProperties";
import { useToast } from "../contexts/useToast";
import { PropertyForm } from "../components/PropertyForm";
import { ReplenishModal } from "../components/ReplenishModal";
import { ReturnStockModal } from "../components/ReturnStockModal";
import { TransferStockModal } from "../components/TransferStockModal";
import { clientsApi } from "../services/clientsApi";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { replenishmentApi } from "../services/replenishmentApi";
import { supplyItemsApi } from "../services/catalogueApi";
import { propertySupplyItemsApi } from "../services/propertySupplyItemsApi";
import { useAuth } from "../contexts/useAuth";
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
  ActionMenu,
} from "../components/ui";

export const PropertyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, canWrite } = useAuth();
  const {
    properties,
    isLoaded: propertiesLoaded,
    updateProperty,
    setPropertyArchived,
    getPropertyById,
    refresh: refreshProperties,
  } = useProperties();

  const [clients, setClients] = useState<Client[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [recentMoves, setRecentMoves] = useState<Replenishment[]>([]);
  const [unbilledLines, setUnbilledLines] = useState<UnbilledLine[]>([]);
  const [stockedItems, setStockedItems] = useState<PropertySupplyItem[]>([]);
  const [allSupplyItems, setAllSupplyItems] = useState<SupplyItem[]>([]);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkLocationId, setLinkLocationId] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");

  const [showReplenishModal, setShowReplenishModal] = useState(false);
  const [replenishSupplyItemId, setReplenishSupplyItemId] = useState("");
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [returnSupplyItemId, setReturnSupplyItemId] = useState("");
  const [transferSupplyItemId, setTransferSupplyItemId] = useState("");
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const [addItemSupplyItemId, setAddItemSupplyItemId] = useState("");
  const [addItemParQty, setAddItemParQty] = useState("");
  const [addItemBusy, setAddItemBusy] = useState(false);
  const [addItemError, setAddItemError] = useState("");
  const [parEditId, setParEditId] = useState("");
  const [parEditValue, setParEditValue] = useState("");
  const [itemActionBusyId, setItemActionBusyId] = useState("");
  const [removeTarget, setRemoveTarget] = useState<PropertySupplyItem | null>(null);

  const property = getPropertyById(id);
  const isArchived = Boolean(property?.archivedAt);
  const canManageProperty = canWrite && !isArchived;
  const canManagePropertySettings = canWrite && user?.teamRole === "owner";

  const canAccessProperty = useMemo(() => {
    if (!property || !user) return false;
    if (user.teamRole === "owner") return true;
    if (!user.allowedPropertyIds || user.allowedPropertyIds.length === 0) return true;
    return user.allowedPropertyIds.includes(property.id);
  }, [property, user]);

  useEffect(() => {
    if (propertiesLoaded && property && !canAccessProperty) {
      navigate("/properties", { replace: true });
    }
  }, [propertiesLoaded, property, canAccessProperty, navigate]);

  const refreshAll = useCallback(async () => {
    if (!id) return;
    try {
      const [locs, reps, unbilled, stocked] = await Promise.all([
        stockLocationsApi.getAll(),
        replenishmentApi.list({ limit: 200, propertyId: id }),
        replenishmentApi.listUnbilled(),
        propertySupplyItemsApi.listByProperty(id),
      ]);
      setStockLocations(locs);
      setRecentMoves(reps);
      setUnbilledLines(unbilled);
      setStockedItems(stocked);
    } catch {
      setStockLocations([]);
      setRecentMoves([]);
      setUnbilledLines([]);
      setStockedItems([]);
    }
  }, [id]);

  useEffect(() => {
    clientsApi.getAll().then(setClients).catch(() => setClients([]));
    supplyItemsApi.getAll().then(setAllSupplyItems).catch(() => setAllSupplyItems([]));
    refreshAll();
  }, [id, refreshAll]);

  const handleStockFlowSuccess = () => {
    refreshAll();
  };

  const propertyHistory = useMemo(
    () => recentMoves.filter((r) => r.propertyId === id),
    [recentMoves, id]
  );

  const propertyMoves = useMemo(() => propertyHistory.slice(0, 15), [propertyHistory]);

  const propertyUnbilled = useMemo(
    () => unbilledLines.filter((line) => line.property?.id === id),
    [unbilledLines, id]
  );

  const sortedStockedItems = useMemo(
    () =>
      [...stockedItems].sort((a, b) =>
        (a.supplyItem?.name || "").localeCompare(b.supplyItem?.name || "", undefined, {
          sensitivity: "base",
        })
      ),
    [stockedItems]
  );

  const availableItemsToAdd = useMemo(
    () =>
      allSupplyItems
        .filter((s) => !s.archivedAt && !stockedItems.some((row) => row.supplyItemId === s.id))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [allSupplyItems, stockedItems]
  );

  const linkedLocations = useMemo(
    () => stockLocations.filter((loc) => (loc.properties || []).some((p) => p.propertyId === id)),
    [stockLocations, id]
  );

  const availableLocationsToLink = useMemo(
    () => stockLocations.filter((loc) => !linkedLocations.some((linked) => linked.id === loc.id)),
    [linkedLocations, stockLocations]
  );

  const propertyClient = useMemo(
    () => clients.find((client) => client.id === property?.clientId) ?? null,
    [clients, property?.clientId]
  );

  const unbilledTotals = useMemo(() => {
    let charges = 0;
    let credits = 0;
    for (const line of propertyUnbilled) {
      const amt = Number(line.billBackAmount) || 0;
      if (amt >= 0) charges += amt;
      else credits += amt;
    }
    return { charges, credits, net: charges + credits };
  }, [propertyUnbilled]);

  const handlePropertySubmit = async (values: PropertyFormValues) => {
    if (!property || isArchived) return;
    try {
      await updateProperty(property.id, values);
      setShowEditModal(false);
      await refreshProperties();
    } catch {
      // keep modal open; error already tracked in useProperties
    }
  };

  const handlePropertyArchive = async () => {
    if (!property) return;
    setArchiveBusy(true);
    try {
      await setPropertyArchived(property.id, !isArchived);
      setShowArchiveConfirm(false);
      toast.success(isArchived ? "Property restored" : "Property archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update property status");
    } finally {
      setArchiveBusy(false);
    }
  };

  const handleLinkLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkLocationId || !id || isArchived) {
      setLinkError("Select a stock location.");
      return;
    }
    setLinkBusy(true);
    setLinkError("");
    try {
      await stockLocationsApi.linkProperty(linkLocationId, id);
      setShowLinkModal(false);
      setLinkLocationId("");
      await refreshAll();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to link location");
    } finally {
      setLinkBusy(false);
    }
  };

  const handleAddStockedItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !addItemSupplyItemId || isArchived) {
      setAddItemError("Select a supply item.");
      return;
    }
    setAddItemBusy(true);
    setAddItemError("");
    try {
      await propertySupplyItemsApi.upsert(id, addItemSupplyItemId, {
        parQuantity: addItemParQty || 0,
      });
      setAddItemSupplyItemId("");
      setAddItemParQty("");
      await refreshAll();
    } catch (err) {
      setAddItemError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setAddItemBusy(false);
    }
  };

  const handleStartParEdit = (row: PropertySupplyItem) => {
    if (isArchived) return;
    setParEditId(row.id);
    setParEditValue(row.parQuantity);
  };

  const handleSaveParEdit = async (row: PropertySupplyItem) => {
    if (!id || isArchived) return;
    setItemActionBusyId(row.id);
    try {
      await propertySupplyItemsApi.upsert(id, row.supplyItemId, { parQuantity: parEditValue || 0 });
      setParEditId("");
      await refreshAll();
    } catch {
      // keep the field open so the user can retry
    } finally {
      setItemActionBusyId("");
    }
  };

  const handleConfirmRemoveStockedItem = async () => {
    if (!id || !removeTarget || isArchived) return;
    setItemActionBusyId(removeTarget.id);
    try {
      await propertySupplyItemsApi.remove(id, removeTarget.supplyItemId);
      setRemoveTarget(null);
      await refreshAll();
    } finally {
      setItemActionBusyId("");
    }
  };

  if (!propertiesLoaded) {
    return (
      <div className="inventory-page">
        <p>Loading…</p>
      </div>
    );
  }

  if (!property || !canAccessProperty) {
    return (
      <div className="inventory-page">
        <EmptyState
          title="Property not found"
          body={<Link to="/properties">Back to properties</Link>}
        />
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <ConfirmDialog
        open={showArchiveConfirm}
        title="Archive property"
        message={`Archive "${property?.name || "this property"}"? It will remain viewable with its audit and billing history, but cannot be changed or used for stock operations.`}
        confirmLabel="Archive"
        danger
        busy={archiveBusy}
        onConfirm={() => void handlePropertyArchive()}
        onCancel={() => {
          if (!archiveBusy) setShowArchiveConfirm(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove stocked item"
        message={
          removeTarget
            ? `Remove ${removeTarget.supplyItem?.name || "this item"} from this property's stocked items?`
            : ""
        }
        confirmLabel="Remove"
        danger
        busy={Boolean(removeTarget && itemActionBusyId === removeTarget.id)}
        onConfirm={() => {
          void handleConfirmRemoveStockedItem();
        }}
        onCancel={() => {
          if (!itemActionBusyId) setRemoveTarget(null);
        }}
      />

      <div className="property-page-back-link-row">
        <Link to="/properties" className="property-page-back-link">
          <Icon name="back" size={16} />
          All properties
        </Link>
      </div>

      <SectionHeader
        title={property.name}
        description={
          <>
            {property.location || "—"}
            <br />
            Client: {propertyClient?.name || <Badge tone="warning">No billing client</Badge>}
            {property.markupPercentage != null && property.markupPercentage !== "" && (
              <span className="property-meta-muted"> · Markup override {String(property.markupPercentage)}%</span>
            )}
          </>
        }
        actions={
          <div className="property-detail-manage">
            {isArchived ? <Badge>Archived</Badge> : null}
            <ActionMenu
              ariaLabel={`Manage ${property.name}`}
              items={[
                {
                  label: "View on billing",
                  onSelect: () => navigate(`/billing?propertyId=${property.id}`),
                },
                ...(canWrite
                  ? [
                      ...(canManagePropertySettings
                        ? isArchived
                          ? [
                              {
                                label: "Restore property",
                                onSelect: () => void handlePropertyArchive(),
                              },
                            ]
                          : [
                              {
                                label: "Edit property",
                                onSelect: () => setShowEditModal(true),
                              },
                              {
                                label: "Archive property",
                                onSelect: () => setShowArchiveConfirm(true),
                                danger: true,
                              },
                            ]
                        : []),
                      ...(!isArchived
                        ? [
                            {
                              label: "Link stock location",
                              onSelect: () => {
                                setLinkLocationId("");
                                setLinkError("");
                                setShowLinkModal(true);
                              },
                            },
                          ]
                        : []),
                    ]
                  : []),
              ]}
            />
          </div>
        }
      />

      {isArchived ? (
        <div className="property-warning-banner">
          This property is archived. Its billing and stock history remain available, but stock and property changes are disabled.
        </div>
      ) : !property.clientId ? (
        <div className="property-warning-banner">
          This property has no billing client. Assign one via Edit property before replenishing — bill-back can&apos;t be queued without a client.
        </div>
      ) : null}

      <Card className="property-allocation-panel">
        <SectionHeader
          title="Stocked items"
          compact
        />

        {sortedStockedItems.length === 0 ? (
          <EmptyState
            title="No stocked items yet"
          />
        ) : (
          <div className="property-supply-grid">
            {sortedStockedItems.map((item) => {
              const allocated = Number(item.allocatedSinceInvoice) || 0;
              const isEditingPar = parEditId === item.id;
              const isBusy = itemActionBusyId === item.id;
              return (
                <article key={item.id} className="property-supply-card">
                  <div className="property-supply-card-header">
                    <strong>{item.supplyItem?.name || "Supply item"}</strong>
                    {canManageProperty ? (
                      <ActionMenu
                        label="Actions"
                        ariaLabel={`Actions for ${item.supplyItem?.name || "stocked item"}`}
                        items={[
                          {
                            label: "Return",
                            onSelect: () => {
                              setReturnSupplyItemId(item.supplyItemId);
                              setShowReturnModal(true);
                            },
                          },
                          {
                            label: "Transfer",
                            onSelect: () => {
                              setTransferSupplyItemId(item.supplyItemId);
                              setShowTransferModal(true);
                            },
                          },
                          {
                            label: "Remove from property",
                            onSelect: () => setRemoveTarget(item),
                            danger: true,
                          },
                        ]}
                      />
                    ) : null}
                  </div>
                  <p>
                    {allocated > 0.000001
                      ? `${allocated.toFixed(2)} base units allocated since last invoice`
                      : "No allocations since last invoice"}
                    {item.recentSkuNames.length > 0 ? ` · ${item.recentSkuNames.join(", ")}` : ""}
                  </p>
                  <div className="property-supply-card-par">
                    <span>Par quantity</span>
                    {isEditingPar ? (
                      <div className="property-supply-card-par-edit">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={parEditValue}
                          onChange={(e) => setParEditValue(e.target.value)}
                          autoFocus
                        />
                        <Button type="button" variant="secondary" size="sm" onClick={() => handleSaveParEdit(item)} disabled={isBusy}>
                          Save
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setParEditId("")} aria-label="Cancel">
                          <Icon name="close" size={16} />
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="property-supply-card-par-value"
                        onClick={() => canManageProperty && handleStartParEdit(item)}
                        disabled={!canManageProperty}
                      >
                        {Number(item.parQuantity) > 0 ? Number(item.parQuantity).toFixed(2) : "Not set"}
                      </button>
                    )}
                  </div>
                  {canManageProperty ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReplenishSupplyItemId(item.supplyItemId);
                        setShowReplenishModal(true);
                      }}
                    >
                      {allocated > 0.000001 ? "Allocate more" : "Allocate stock"}
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
        {canManageProperty ? (
          <form className="property-add-item-form" onSubmit={handleAddStockedItem}>
            <FormField label="Add a stocked item" className="property-add-item-field">
              {(inputProps) => (
                <select
                  {...inputProps}
                  value={addItemSupplyItemId}
                  onChange={(e) => setAddItemSupplyItemId(e.target.value)}
                >
                  <option value="">
                    {availableItemsToAdd.length === 0 ? "All supply items already added" : "Select supply item…"}
                  </option>
                  {availableItemsToAdd.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Par quantity" className="property-add-item-field">
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Optional"
                  value={addItemParQty}
                  onChange={(e) => setAddItemParQty(e.target.value)}
                />
              )}
            </FormField>
            <Button type="submit" variant="secondary" size="sm" disabled={addItemBusy || !addItemSupplyItemId}>
              {addItemBusy ? "Adding…" : "Add item"}
            </Button>
          </form>
        ) : null}
        {addItemError && <p className="property-form-error">{addItemError}</p>}
      </Card>

      <Card>
        <SectionHeader
          title={`Unbilled lines (${propertyUnbilled.length})`}
          compact
          actions={
            <Link to={`/billing?propertyId=${property.id}`} className="property-inline-link">
              View on Billing
            </Link>
          }
        />
        {propertyUnbilled.length === 0 ? (
          <EmptyState
            title="No unbilled lines"
          />
        ) : (
          <>
            <p className="property-unbilled-summary">
              Charges ${unbilledTotals.charges.toFixed(2)} · Credits ${unbilledTotals.credits.toFixed(2)} · Net ${unbilledTotals.net.toFixed(2)}
            </p>
            <div className="table-wrapper">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {propertyUnbilled.map((line) => (
                    <tr key={line.id}>
                      <td>{line.isCredit ? "Credit" : "Charge"}</td>
                      <td>{line.supplyItem?.name || line.sku?.name || "—"}</td>
                      <td>{Number(line.baseQtyDeployed).toFixed(2)}</td>
                      <td className={line.isCredit ? "property-unbilled-amount property-unbilled-amount-credit" : "property-unbilled-amount"}>
                        ${Number(line.billBackAmount).toFixed(2)}
                      </td>
                      <td>{new Date(line.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card>
        <SectionHeader title="Recent moves" compact />
        {propertyMoves.length === 0 ? (
          <EmptyState
            title="No recent moves"
          />
        ) : (
          <ul className="property-moves-list">
            {propertyMoves.map((r) => {
              const isTransfer = !!r.transferGroupId;
              const label = isTransfer ? (r.direction === "return" ? "transfer out" : "transfer in") : r.direction;
              return (
                <li key={r.id}>
                  <strong>{label}</strong>
                  {isTransfer ? " · pass-through" : ""} · {r.stockLocation?.name || "Location"} · {(r.lines || []).length} line(s) · {new Date(r.createdAt).toLocaleString()}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit property"
        maxWidth="720px"
      >
        <PropertyForm
          key={property.id}
          initialValues={property}
          clients={clients}
          stockLocations={stockLocations}
          onSubmit={handlePropertySubmit}
          onCancel={() => setShowEditModal(false)}
        />
      </Modal>

      <Modal
        open={showLinkModal}
        onClose={() => {
          if (!linkBusy) setShowLinkModal(false);
        }}
        title="Link stock location"
        maxWidth="420px"
        busy={linkBusy}
      >
        <form className="stacked-form" onSubmit={handleLinkLocation}>
          <FormField label="Stock location" required error={linkError || undefined}>
            {(inputProps) => (
              <select
                {...inputProps}
                value={linkLocationId}
                onChange={(e) => setLinkLocationId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {availableLocationsToLink.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setShowLinkModal(false)} disabled={linkBusy}>
              Cancel
            </Button>
            <Button type="submit" disabled={linkBusy}>
              {linkBusy ? "Linking…" : "Link"}
            </Button>
          </div>
        </form>
      </Modal>

      {showReplenishModal && canManageProperty && (
        <ReplenishModal
          properties={properties.filter((row) => !row.archivedAt)}
          clients={clients}
          stockLocations={stockLocations}
          initialPropertyId={property.id}
          initialSupplyItemId={replenishSupplyItemId || undefined}
          onClose={() => setShowReplenishModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}

      {showReturnModal && canManageProperty && (
        <ReturnStockModal
          propertyId={property.id}
          supplyItemId={returnSupplyItemId}
          onClose={() => setShowReturnModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}
      {showTransferModal && canManageProperty && (
        <TransferStockModal
          properties={properties.filter((row) => !row.archivedAt)}
          clients={clients}
          stockLocations={stockLocations}
          initialFromPropertyId={property.id}
          supplyItemId={transferSupplyItemId}
          onClose={() => setShowTransferModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}
    </div>
  );
};
