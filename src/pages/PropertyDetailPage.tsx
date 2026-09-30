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
import { SectionHeader } from "../components/ui/SectionHeader";

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

  const handleRemoveStockedItem = async (row: PropertySupplyItem) => {
    if (!id) return;
    if (!window.confirm(`Remove ${row.supplyItem?.name || "this item"} from this property's stocked items?`)) {
      return;
    }
    setItemActionBusyId(row.id);
    try {
      await propertySupplyItemsApi.remove(id, row.supplyItemId);
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
        <div className="empty-state">
          <h3>Property not found</h3>
          <p>
            <Link to="/properties">Back to properties</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <div style={{ marginBottom: "8px" }}>
        <Link to="/properties" style={{ fontSize: "13px", color: "#2563eb", textDecoration: "none" }}>
          ← All properties
        </Link>
      </div>

      <SectionHeader
        title={property.name}
        description={
          <>
            {property.location || "—"}
            <br />
            Client:{" "}
            {clients.find((c) => c.id === property.clientId)?.name || (
              <span style={{ color: "#b45309" }}>None assigned</span>
            )}
            {property.markupPercentage != null && property.markupPercentage !== "" && (
              <span style={{ color: "#64748b" }}> · Markup override {String(property.markupPercentage)}%</span>
            )}
          </>
        }
        actions={
          canWrite ? (
            <>
            <button type="button" className="secondary" onClick={() => setShowEditModal(true)}>
              Edit property
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setLinkLocationId("");
                setLinkError("");
                setShowLinkModal(true);
              }}
            >
              Link location
            </button>
            </>
          ) : null
        }
      />

      {!property.clientId && (
        <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: "13px", marginBottom: "16px" }}>
          This property has no billing client. Assign one via Edit property before replenishing — bill-back can&apos;t be
          queued without a client.
        </div>
      )}

      <div className="stock-toolbar property-secondary-actions">
        {canWrite && (
          <>
            <button type="button" className="add-property-button" onClick={() => setShowReturnModal(true)}>
              Return
            </button>
            <button type="button" className="add-property-button" onClick={() => setShowTransferModal(true)}>
              Transfer
            </button>
          </>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => navigate(`/billing?propertyId=${property.id}`)}
        >
          View on Billing
        </button>
      </div>

      <section className="panel property-allocation-panel">
        <SectionHeader
          title="Stocked items"
          description="The supply items this property is stocked with. Allocate stock without re-selecting the property, and see what's gone out since the last invoice."
          compact
        />

        {canWrite && (
          <form className="property-add-item-form" onSubmit={handleAddStockedItem}>
            <label>
              <span>Add a stocked item</span>
              <select
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
            </label>
            <label>
              <span>Par quantity</span>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Optional"
                value={addItemParQty}
                onChange={(e) => setAddItemParQty(e.target.value)}
              />
            </label>
            <button type="submit" className="secondary" disabled={addItemBusy || !addItemSupplyItemId}>
              {addItemBusy ? "Adding…" : "Add item"}
            </button>
          </form>
        )}
        {addItemError && <p style={{ color: "#b91c1c", fontSize: "13px" }}>{addItemError}</p>}

        {sortedStockedItems.length === 0 ? (
          <div className="empty-state">
            <h3>No stocked items yet</h3>
            <p>Add the supply items this property receives, so everyone can see what it&apos;s stocked with at a glance.</p>
          </div>
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
                    {canWrite && (
                      <button
                        type="button"
                        className="property-supply-card-remove"
                        onClick={() => handleRemoveStockedItem(item)}
                        disabled={isBusy}
                      >
                        Remove
                      </button>
                    )}
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
                        <button type="button" className="secondary" onClick={() => handleSaveParEdit(item)} disabled={isBusy}>
                          Save
                        </button>
                        <button type="button" className="icon-button" onClick={() => setParEditId("")} aria-label="Cancel">
                          ✕
                        </button>
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
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setReplenishSupplyItemId(item.supplyItemId);
                        setShowReplenishModal(true);
                      }}
                    >
                      {allocated > 0.000001 ? "Allocate more" : "Allocate stock"}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Unbilled lines ({propertyUnbilled.length})</h3>
          <Link to={`/billing?propertyId=${property.id}`} style={{ fontSize: "13px" }}>
            View on Billing →
          </Link>
        </div>
        {propertyUnbilled.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "14px" }}>No unbilled charges or credits for this property.</p>
        ) : (
          <>
            <p style={{ fontSize: "14px" }}>
              Charges ${unbilledTotals.charges.toFixed(2)} · Credits ${unbilledTotals.credits.toFixed(2)} · Net $
              {unbilledTotals.net.toFixed(2)}
            </p>
            <div style={{ overflowX: "auto" }}>
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
                      <td style={{ color: line.isCredit ? "#b91c1c" : undefined }}>
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
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Recent moves</h3>
        {propertyMoves.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "14px" }}>No replenishments, returns, or transfers yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "14px" }}>
            {propertyMoves.map((r) => {
              const isTransfer = !!r.transferGroupId;
              const label = isTransfer ? (r.direction === "return" ? "transfer out" : "transfer in") : r.direction;
              return (
                <li key={r.id}>
                  <strong>{label}</strong>
                  {isTransfer ? " · pass-through" : ""} · {r.stockLocation?.name || "Location"} ·{" "}
                  {(r.lines || []).length} line(s) · {new Date(r.createdAt).toLocaleString()}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3>Edit property</h3>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => setShowEditModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <PropertyForm
              key={property.id}
              initialValues={property}
              clients={clients}
              stockLocations={stockLocations}
              onSubmit={handlePropertySubmit}
              onCancel={() => setShowEditModal(false)}
            />
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="modal-overlay" onClick={() => !linkBusy && setShowLinkModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <h3 style={{ marginTop: 0 }}>Link stock location</h3>
            <form className="inventory-form" onSubmit={handleLinkLocation}>
              <label>
                <span>Stock location *</span>
                <select value={linkLocationId} onChange={(e) => setLinkLocationId(e.target.value)} required>
                  <option value="">Select…</option>
                  {stockLocations
                    .filter((loc) => !linkedLocations.some((l) => l.id === loc.id))
                    .map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                </select>
              </label>
              {linkError && <p style={{ color: "#b91c1c", fontSize: "14px" }}>{linkError}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowLinkModal(false)} disabled={linkBusy}>
                  Cancel
                </button>
                <button type="submit" disabled={linkBusy}>
                  {linkBusy ? "Linking…" : "Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
