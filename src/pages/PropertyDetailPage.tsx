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
} from "../components/ui";

export const PropertyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, canWrite } = useAuth();
  const {
    properties,
    isLoaded: propertiesLoaded,
    updateProperty,
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

  const [addItemSupplyItemId, setAddItemSupplyItemId] = useState("");
  const [addItemParQty, setAddItemParQty] = useState("");
  const [addItemBusy, setAddItemBusy] = useState(false);
  const [addItemError, setAddItemError] = useState("");
  const [parEditId, setParEditId] = useState("");
  const [parEditValue, setParEditValue] = useState("");
  const [itemActionBusyId, setItemActionBusyId] = useState("");
  const [removeTarget, setRemoveTarget] = useState<PropertySupplyItem | null>(null);

  const property = getPropertyById(id);

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
    if (!property) return;
    try {
      await updateProperty(property.id, values);
      setShowEditModal(false);
      await refreshProperties();
    } catch {
      // keep modal open; error already tracked in useProperties
    }
  };

  const handleLinkLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkLocationId || !id) {
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
    if (!id || !addItemSupplyItemId) {
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
    setParEditId(row.id);
    setParEditValue(row.parQuantity);
  };

  const handleSaveParEdit = async (row: PropertySupplyItem) => {
    if (!id) return;
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
    if (!id || !removeTarget) return;
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
          canWrite ? (
            <>
              <Button variant="secondary" onClick={() => setShowEditModal(true)}>
                <Icon name="edit" size={16} />
                Edit property
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setLinkLocationId("");
                  setLinkError("");
                  setShowLinkModal(true);
                }}
              >
                <Icon name="add" size={16} />
                Link location
              </Button>
            </>
          ) : null
        }
      />

      {!property.clientId && (
        <div className="property-warning-banner">
          This property has no billing client. Assign one via Edit property before replenishing — bill-back can&apos;t be queued without a client.
        </div>
      )}

      <div className="stock-toolbar property-secondary-actions">
        {canWrite && (
          <>
            <Button variant="secondary" onClick={() => setShowReturnModal(true)}>
              Return
            </Button>
            <Button variant="secondary" onClick={() => setShowTransferModal(true)}>
              Transfer
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          onClick={() => navigate(`/billing?propertyId=${property.id}`)}
        >
          View on Billing
        </Button>
      </div>

      <Card className="property-allocation-panel">
        <SectionHeader
          title="Stocked items"
          description="The supply items this property is stocked with. Allocate stock without re-selecting the property, and see what's gone out since the last invoice."
          compact
        />

        {canWrite && (
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
            <FormField label="Par quantity" className="property-add-item-field" hint="Optional">
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
        )}
        {addItemError && <p className="property-form-error">{addItemError}</p>}

        {sortedStockedItems.length === 0 ? (
          <EmptyState
            title="No stocked items yet"
            body="Add the supply items this property receives, so everyone can see what it's stocked with at a glance."
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
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="property-supply-card-remove"
                        onClick={() => setRemoveTarget(item)}
                        disabled={isBusy}
                      >
                        Remove
                      </Button>
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
                        onClick={() => canWrite && handleStartParEdit(item)}
                        disabled={!canWrite}
                      >
                        {Number(item.parQuantity) > 0 ? Number(item.parQuantity).toFixed(2) : "Not set"}
                      </button>
                    )}
                  </div>
                  {canWrite ? (
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
            body="No unbilled charges or credits for this property."
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
            body="No replenishments, returns, or transfers yet."
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
          <p className="modal-intro">
            Link an existing stock location so this property can replenish from it.
          </p>
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

      {showReplenishModal && (
        <ReplenishModal
          properties={properties}
          clients={clients}
          stockLocations={stockLocations}
          initialPropertyId={property.id}
          initialSupplyItemId={replenishSupplyItemId || undefined}
          onClose={() => setShowReplenishModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}

      {showReturnModal && (
        <ReturnStockModal
          onClose={() => setShowReturnModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}

      {showTransferModal && (
        <TransferStockModal
          properties={properties}
          clients={clients}
          stockLocations={stockLocations}
          onClose={() => setShowTransferModal(false)}
          onSuccess={handleStockFlowSuccess}
        />
      )}
    </div>
  );
};
