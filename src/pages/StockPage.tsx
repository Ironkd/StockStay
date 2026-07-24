import React, { useEffect, useMemo, useState } from "react";
import type {
  Sku,
  SkuFormValues,
  StockLocation,
  StockTransaction,
  SupplyItem,
  SupplyItemFormValues,
  UnitOfMeasure,
} from "../types";
import { stockLocationsApi, unitsOfMeasureApi } from "../services/stockLocationsApi";
import { skusApi, stockTransactionsApi, supplyItemsApi } from "../services/catalogueApi";

type Tab = "onhand" | "catalogue" | "activity";

type OnHandGroup = {
  supplyItemId: string;
  name: string;
  category: string;
  baseUnitLabel: string;
  skus: Sku[];
  packsOnHand: number;
  baseUnitsOnHand: number;
};

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
}

export const StockPage: React.FC = () => {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [locationsLoaded, setLocationsLoaded] = useState(false);

  const [supplyItems, setSupplyItems] = useState<SupplyItem[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [activitySkuId, setActivitySkuId] = useState<string>("");

  const [activeTab, setActiveTab] = useState<Tab>("onhand");

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveSkuId, setReceiveSkuId] = useState("");
  const [receiveQty, setReceiveQty] = useState("");

  const [showSupplyItemModal, setShowSupplyItemModal] = useState(false);
  const [supplyItemName, setSupplyItemName] = useState("");
  const [supplyItemCategory, setSupplyItemCategory] = useState("");
  const [supplyItemBaseUnitId, setSupplyItemBaseUnitId] = useState("");

  const [showSkuModal, setShowSkuModal] = useState(false);
  const [skuName, setSkuName] = useState("");
  const [skuSupplyItemId, setSkuSupplyItemId] = useState("");
  const [skuPackSize, setSkuPackSize] = useState("");
  const [skuPurchasePrice, setSkuPurchasePrice] = useState("");
  const [skuSupplier, setSkuSupplier] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshLocations = async () => {
    try {
      const locs = await stockLocationsApi.getAll();
      setLocations(locs);
      setSelectedLocationId((prev) => {
        if (prev && locs.some((l) => l.id === prev)) return prev;
        return locs[0]?.id || "";
      });
    } catch {
      setLocations([]);
    } finally {
      setLocationsLoaded(true);
    }
  };

  useEffect(() => {
    refreshLocations();
    unitsOfMeasureApi.getAll().then(setUnits).catch(() => setUnits([]));
    supplyItemsApi.getAll().then(setSupplyItems).catch(() => setSupplyItems([]));
  }, []);

  const refreshSkus = async () => {
    if (!selectedLocationId) {
      setSkus([]);
      return;
    }
    try {
      const rows = await skusApi.getAll({ stockLocationId: selectedLocationId });
      setSkus(rows);
    } catch {
      setSkus([]);
    }
  };

  useEffect(() => {
    refreshSkus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId]);

  const refreshSupplyItems = async () => {
    try {
      const rows = await supplyItemsApi.getAll();
      setSupplyItems(rows);
    } catch {
      setSupplyItems([]);
    }
  };

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  const refreshActivity = async () => {
    if (!selectedLocationId) {
      setTransactions([]);
      return;
    }
    setTransactionsLoading(true);
    try {
      if (activitySkuId) {
        const rows = await stockTransactionsApi.getAll({ skuId: activitySkuId, limit: 50 });
        setTransactions(rows);
      } else {
        const targetSkus = skus.slice(0, 25);
        if (targetSkus.length === 0) {
          setTransactions([]);
        } else {
          const results = await Promise.all(
            targetSkus.map((s) =>
              stockTransactionsApi.getAll({ skuId: s.id, limit: 20 }).catch(() => [])
            )
          );
          const merged = results
            .flat()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 50);
          setTransactions(merged);
        }
      }
    } catch {
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "activity") return;
    refreshActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedLocationId, activitySkuId, skus]);

  useEffect(() => {
    setActivitySkuId("");
  }, [selectedLocationId]);

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationName.trim()) {
      setError("Stock location name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await stockLocationsApi.create({
        name: locationName.trim(),
        address: locationAddress.trim() || null,
      });
      setShowLocationModal(false);
      setLocationName("");
      setLocationAddress("");
      await refreshLocations();
      setSelectedLocationId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create stock location");
    } finally {
      setBusy(false);
    }
  };

  const openReceiveModal = (skuId?: string) => {
    setReceiveSkuId(skuId || "");
    setReceiveQty("");
    setError("");
    setShowReceiveModal(true);
  };

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(receiveQty);
    if (!receiveSkuId) {
      setError("Select a SKU to receive.");
      return;
    }
    if (!(qty > 0)) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await skusApi.receive(receiveSkuId, qty);
      setShowReceiveModal(false);
      setReceiveSkuId("");
      setReceiveQty("");
      await refreshSkus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to receive packs");
    } finally {
      setBusy(false);
    }
  };

  const openSupplyItemModal = () => {
    setSupplyItemName("");
    setSupplyItemCategory("");
    setSupplyItemBaseUnitId(units[0]?.id || "");
    setError("");
    setShowSupplyItemModal(true);
  };

  const handleCreateSupplyItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplyItemName.trim()) {
      setError("Supply item name is required.");
      return;
    }
    if (!supplyItemBaseUnitId) {
      setError("Select a base unit.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const values: SupplyItemFormValues = {
        name: supplyItemName.trim(),
        category: supplyItemCategory.trim() || undefined,
        baseUnitId: supplyItemBaseUnitId,
      };
      const created = await supplyItemsApi.create(values);
      setShowSupplyItemModal(false);
      // Keep local list in sync immediately so the SKU modal select includes this item
      setSupplyItems((prev) =>
        prev.some((p) => p.id === created.id) ? prev : [...prev, created]
      );
      await refreshSupplyItems();
      // Clear busy before confirm/open — otherwise the SKU modal opens with
      // submit/cancel disabled (busy was still true until finally ran).
      setBusy(false);
      if (window.confirm(`Add a SKU (pack) for "${created.name}" now?`)) {
        openSkuModal(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add supply item");
      setBusy(false);
    }
  };

  const openSkuModal = (supplyItemId?: string) => {
    if (!selectedLocationId) {
      setError("Select a stock location first.");
      return;
    }
    if (supplyItems.length === 0 && !supplyItemId) {
      setError("");
      openSupplyItemModal();
      return;
    }
    setSkuName("");
    setSkuSupplyItemId(supplyItemId || supplyItems[0]?.id || "");
    setSkuPackSize("");
    setSkuPurchasePrice("");
    setSkuSupplier("");
    setError("");
    setBusy(false);
    setShowSkuModal(true);
  };

  const handleCreateSku = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuName.trim()) {
      setError("SKU name is required.");
      return;
    }
    if (!skuSupplyItemId) {
      setError("Select a supply item.");
      return;
    }
    if (!selectedLocationId) {
      setError("Select a stock location first.");
      return;
    }
    const packSize = Number(skuPackSize);
    const purchasePrice = Number(skuPurchasePrice);
    if (!(packSize > 0)) {
      setError("Pack size must be greater than zero.");
      return;
    }
    if (!(purchasePrice >= 0) || Number.isNaN(purchasePrice)) {
      setError("Purchase price must be zero or greater.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const values: SkuFormValues = {
        name: skuName.trim(),
        supplyItemId: skuSupplyItemId,
        stockLocationId: selectedLocationId,
        supplier: skuSupplier.trim() || null,
        packSize,
        purchasePrice,
      };
      await skusApi.create(values);
      setShowSkuModal(false);
      setActiveTab("onhand");
      await refreshSkus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add SKU");
    } finally {
      setBusy(false);
    }
  };

  const unitName = (unitId?: string) => units.find((u) => u.id === unitId)?.code || "—";

  const onHandGroups = useMemo((): OnHandGroup[] => {
    const byId = new Map<string, OnHandGroup>();
    for (const sku of skus) {
      const supplyItemId = sku.supplyItemId || sku.supplyItem?.id || "unknown";
      const fromCatalogue = supplyItems.find((s) => s.id === supplyItemId);
      const name =
        sku.supplyItem?.name || fromCatalogue?.name || "Unknown supply item";
      const category = sku.supplyItem?.category || fromCatalogue?.category || "";
      const baseUnitLabel =
        fromCatalogue?.baseUnit?.code ||
        unitName(fromCatalogue?.baseUnitId || sku.supplyItem?.baseUnitId) ||
        "units";
      const packs = sku.stockOnHand ? Number(sku.stockOnHand.quantity) || 0 : 0;
      const packSize = Number(sku.packSize) || 0;
      const base = packs * packSize;

      let group = byId.get(supplyItemId);
      if (!group) {
        group = {
          supplyItemId,
          name,
          category,
          baseUnitLabel,
          skus: [],
          packsOnHand: 0,
          baseUnitsOnHand: 0,
        };
        byId.set(supplyItemId, group);
      }
      group.skus.push(sku);
      group.packsOnHand += packs;
      group.baseUnitsOnHand += base;
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [skus, supplyItems, units]);

  return (
    <div className="inventory-page">
      <h2>Stock</h2>
      <p style={{ marginTop: "-8px", marginBottom: "16px", color: "#64748b", fontSize: "14px" }}>
        Locations hold packs (SKUs) of your supply items. Deploy stock to properties from the Properties page.
      </p>

      <div className="stock-toolbar" style={{ flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", marginRight: "8px" }}>
          <span style={{ fontSize: "12px", color: "#64748b" }}>Stock location</span>
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            style={{ minHeight: "38px", minWidth: "220px" }}
            disabled={!locationsLoaded || locations.length === 0}
          >
            {locations.length === 0 && <option value="">No locations yet</option>}
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setLocationName("");
            setLocationAddress("");
            setError("");
            setShowLocationModal(true);
          }}
        >
          + New location
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="add-property-button"
          onClick={() => openReceiveModal()}
          disabled={!selectedLocationId || skus.length === 0}
        >
          Receive packs
        </button>
        <button type="button" className="secondary" onClick={openSupplyItemModal}>
          Add supply item
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => openSkuModal()}
          disabled={!selectedLocationId}
          title={
            supplyItems.length === 0
              ? "Add a supply item first (opens that flow)"
              : "Add a purchasable pack (SKU) at this location"
          }
        >
          Add SKU
        </button>
      </div>

      <div className="property-tabs">
        <button
          type="button"
          className={`property-tab ${activeTab === "onhand" ? "active" : ""}`}
          onClick={() => setActiveTab("onhand")}
        >
          On hand
          <span className="tab-count">({skus.length})</span>
        </button>
        <button
          type="button"
          className={`property-tab ${activeTab === "catalogue" ? "active" : ""}`}
          onClick={() => setActiveTab("catalogue")}
        >
          Catalogue
          <span className="tab-count">({supplyItems.length})</span>
        </button>
        <button
          type="button"
          className={`property-tab ${activeTab === "activity" ? "active" : ""}`}
          onClick={() => setActiveTab("activity")}
        >
          Activity
        </button>
      </div>

      <section className="panel">
        {!selectedLocationId && locationsLoaded ? (
          <div className="empty-state">
            <h3>No stock locations yet</h3>
            <p>Create a stock location to start receiving packs.</p>
          </div>
        ) : (
          <>
            {activeTab === "onhand" && (
              <>
                <h3 style={{ marginTop: 0 }}>
                  On hand{selectedLocation ? ` · ${selectedLocation.name}` : ""}
                </h3>
                <p style={{ marginTop: "-4px", color: "#64748b", fontSize: "13px" }}>
                  Grouped by supply item. Totals are equivalent base units across all pack sizes.
                </p>
                {skus.length === 0 ? (
                  <div className="empty-state">
                    <h3>Nothing here yet</h3>
                    <p>Add a supply item / receive packs to see stock on hand.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {onHandGroups.map((group) => (
                      <div
                        key={group.supplyItemId}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            flexWrap: "wrap",
                            padding: "12px 14px",
                            background: "#f8fafc",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: "15px" }}>{group.name}</strong>
                            {group.category ? (
                              <span style={{ marginLeft: "8px", color: "#64748b", fontSize: "13px" }}>
                                {group.category}
                              </span>
                            ) : null}
                            <div style={{ marginTop: "4px", fontSize: "13px", color: "#334155" }}>
                              ≈ {formatQty(group.baseUnitsOnHand)} {group.baseUnitLabel}
                              <span style={{ color: "#94a3b8" }}>
                                {" "}
                                · {formatQty(group.packsOnHand)} packs · {group.skus.length} SKU
                                {group.skus.length === 1 ? "" : "s"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => openSkuModal(group.supplyItemId)}
                          >
                            Add SKU
                          </button>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table className="inventory-table" style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th>SKU</th>
                                <th>Pack size</th>
                                <th>Purchase price</th>
                                <th>Unit rate</th>
                                <th>Packs on hand</th>
                                <th>Base equiv.</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.skus.map((sku) => {
                                const packs = sku.stockOnHand
                                  ? Number(sku.stockOnHand.quantity) || 0
                                  : 0;
                                const packSize = Number(sku.packSize) || 0;
                                return (
                                  <tr key={sku.id}>
                                    <td>
                                      {sku.name}
                                      {sku.supplier ? (
                                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                                          {sku.supplier}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td>
                                      {formatQty(packSize)} {group.baseUnitLabel}
                                    </td>
                                    <td>${Number(sku.purchasePrice).toFixed(2)}</td>
                                    <td>${Number(sku.unitRate).toFixed(4)}</td>
                                    <td>{formatQty(packs)}</td>
                                    <td>
                                      {formatQty(packs * packSize)} {group.baseUnitLabel}
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="secondary"
                                        onClick={() => openReceiveModal(sku.id)}
                                      >
                                        Receive
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "catalogue" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <h3 style={{ margin: 0 }}>Supply items</h3>
                  <button type="button" className="secondary" onClick={openSupplyItemModal}>
                    Add supply item
                  </button>
                </div>
                {supplyItems.length === 0 ? (
                  <div className="empty-state">
                    <h3>No supply items yet</h3>
                    <p>Add a supply item to start building your catalogue.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Category</th>
                          <th>Base unit</th>
                          <th>Default reorder point</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplyItems.map((item) => (
                          <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>{item.category || "—"}</td>
                            <td>{item.baseUnit?.code || unitName(item.baseUnitId)}</td>
                            <td>{item.defaultReorderPoint ?? "—"}</td>
                            <td>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => openSkuModal(item.id)}
                                disabled={!selectedLocationId}
                              >
                                Add SKU
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {activeTab === "activity" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                  <h3 style={{ margin: 0 }}>
                    Activity{selectedLocation ? ` · ${selectedLocation.name}` : ""}
                  </h3>
                  <label style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>Filter by SKU</span>
                    <select
                      value={activitySkuId}
                      onChange={(e) => setActivitySkuId(e.target.value)}
                      style={{ minHeight: "34px", minWidth: "200px" }}
                    >
                      <option value="">All SKUs at this location</option>
                      {skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {transactionsLoading ? (
                  <p style={{ color: "#64748b", fontSize: "14px" }}>Loading…</p>
                ) : transactions.length === 0 ? (
                  <div className="empty-state">
                    <h3>No activity yet</h3>
                    <p>Receipts, adjustments, and replenishments will show up here.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Qty delta</th>
                          <th>Reason</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((t) => (
                          <tr key={t.id}>
                            <td>{t.transactionType.replace(/_/g, " ")}</td>
                            <td>{Number(t.quantityDelta) > 0 ? "+" : ""}{Number(t.quantityDelta).toFixed(2)}</td>
                            <td>{t.reason || "—"}</td>
                            <td>{new Date(t.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      {showLocationModal && (
        <div className="modal-overlay" onClick={() => !busy && setShowLocationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <h3 style={{ marginTop: 0 }}>Add stock location</h3>
            <form className="inventory-form" onSubmit={handleCreateLocation}>
              <label>
                <span>Name *</span>
                <input
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g. Central Supply"
                  required
                />
              </label>
              <label>
                <span>Address</span>
                <input
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              {error && <p style={{ color: "#b91c1c", fontSize: "14px" }}>{error}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowLocationModal(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReceiveModal && (
        <div className="modal-overlay" onClick={() => !busy && setShowReceiveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <h3 style={{ marginTop: 0 }}>Receive packs</h3>
            <form className="inventory-form" onSubmit={handleReceive}>
              <label>
                <span>SKU *</span>
                <select value={receiveSkuId} onChange={(e) => setReceiveSkuId(e.target.value)} required>
                  <option value="">Select SKU…</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.stockOnHand ? ` (${Number(s.stockOnHand.quantity).toFixed(2)} on hand)` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Quantity (packs) *</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={receiveQty}
                  onChange={(e) => setReceiveQty(e.target.value)}
                  required
                />
              </label>
              {error && <p style={{ color: "#b91c1c", fontSize: "14px" }}>{error}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowReceiveModal(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}>
                  {busy ? "Receiving…" : "Receive"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSupplyItemModal && (
        <div className="modal-overlay" onClick={() => !busy && setShowSupplyItemModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <h3 style={{ marginTop: 0 }}>Add supply item</h3>
            <form className="inventory-form" onSubmit={handleCreateSupplyItem}>
              <div className="form-grid">
                <label>
                  <span>Name *</span>
                  <input
                    value={supplyItemName}
                    onChange={(e) => setSupplyItemName(e.target.value)}
                    placeholder="e.g. Toilet paper"
                    required
                  />
                </label>
                <label>
                  <span>Category</span>
                  <input
                    value={supplyItemCategory}
                    onChange={(e) => setSupplyItemCategory(e.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label>
                  <span>Base unit *</span>
                  <select
                    value={supplyItemBaseUnitId}
                    onChange={(e) => setSupplyItemBaseUnitId(e.target.value)}
                    required
                    disabled={units.length === 0}
                  >
                    <option value="">Select…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {units.length === 0 && (
                <p style={{ color: "#b45309", fontSize: "13px" }}>
                  No units of measure found. Run database migrations so seeded units (ea, pack, …) are available.
                </p>
              )}
              {error && <p style={{ color: "#b91c1c", fontSize: "14px" }}>{error}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowSupplyItemModal(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSkuModal && (
        <div className="modal-overlay" onClick={() => !busy && setShowSkuModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <h3 style={{ marginTop: 0 }}>Add SKU</h3>
            <p style={{ marginTop: 0, color: "#64748b", fontSize: "13px" }}>
              At {selectedLocation?.name || "selected location"}
            </p>
            <form className="inventory-form" onSubmit={handleCreateSku}>
              <div className="form-grid">
                <label>
                  <span>Name *</span>
                  <input
                    value={skuName}
                    onChange={(e) => setSkuName(e.target.value)}
                    placeholder="e.g. Case of 24 rolls"
                    required
                  />
                </label>
                <label>
                  <span>Supply item *</span>
                  <select
                    value={skuSupplyItemId}
                    onChange={(e) => setSkuSupplyItemId(e.target.value)}
                    required
                  >
                    <option value="">Select…</option>
                    {supplyItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Pack size (base units) *</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={skuPackSize}
                    onChange={(e) => setSkuPackSize(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Purchase price *</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={skuPurchasePrice}
                    onChange={(e) => setSkuPurchasePrice(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Supplier</span>
                  <input
                    value={skuSupplier}
                    onChange={(e) => setSkuSupplier(e.target.value)}
                    placeholder="Optional"
                  />
                </label>
              </div>
              {error && <p style={{ color: "#b91c1c", fontSize: "14px" }}>{error}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowSkuModal(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
