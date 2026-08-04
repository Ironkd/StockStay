import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  LocationSupplyThreshold,
  Property,
  Sku,
  StockLocation,
  StockTransaction,
  StockTransactionActor,
  SupplyItem,
  SupplyItemFormValues,
  UnitOfMeasure,
} from "../types";
import { stockLocationsApi, unitsOfMeasureApi } from "../services/stockLocationsApi";
import {
  locationSupplyThresholdsApi,
  skusApi,
  stockTransactionsApi,
  supplyItemsApi,
} from "../services/catalogueApi";
import { propertiesApi } from "../services/propertiesApi";
import { useAuth } from "../contexts/useAuth";
import { EditSupplyItemModal } from "../components/EditSupplyItemModal";

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

type LocationSummary = {
  skuCount: number;
  packsOnHand: number;
};

import { formatQty as formatQtyShared } from "../utils/format";

function formatQty(n: number): string {
  return formatQtyShared(n, 4);
}

function actorDisplayName(user?: StockTransactionActor | null): string {
  if (!user) return "—";
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.name || "—";
}

function localDateInputValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const StockPage: React.FC = () => {
  const { canWrite } = useAuth();
  const { locationId: routeLocationId } = useParams<{ locationId?: string }>();
  const navigate = useNavigate();
  const isDetail = Boolean(routeLocationId);

  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [allSkus, setAllSkus] = useState<Sku[]>([]);

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
  const [receivePrice, setReceivePrice] = useState("");
  const [receiveDate, setReceiveDate] = useState("");
  const [receiveSkuOptions, setReceiveSkuOptions] = useState<Sku[]>([]);
  const [actionLocationId, setActionLocationId] = useState<string>("");

  const [showSupplyItemModal, setShowSupplyItemModal] = useState(false);
  const [supplyItemName, setSupplyItemName] = useState("");
  const [supplyItemCategory, setSupplyItemCategory] = useState("");
  const [supplyItemBaseUnitId, setSupplyItemBaseUnitId] = useState("");

  const [editingSupplyItem, setEditingSupplyItem] = useState<SupplyItem | null>(null);
  const [receiveStockedSkuIds, setReceiveStockedSkuIds] = useState<Set<string>>(new Set());
  const [thresholds, setThresholds] = useState<LocationSupplyThreshold[]>([]);

  const [showPropertiesModal, setShowPropertiesModal] = useState(false);
  const [manageLocationId, setManageLocationId] = useState<string>("");
  const [teamProperties, setTeamProperties] = useState<Property[]>([]);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [initialLinkedPropertyIds, setInitialLinkedPropertyIds] = useState<Set<string>>(
    new Set()
  );
  const [propertiesBusy, setPropertiesBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedLocationId = routeLocationId || actionLocationId;
  const manageLocation = locations.find((l) => l.id === manageLocationId);

  const refreshLocations = async () => {
    try {
      const locs = await stockLocationsApi.getAll();
      setLocations(locs);
      return locs;
    } catch {
      setLocations([]);
      return [] as StockLocation[];
    } finally {
      setLocationsLoaded(true);
    }
  };

  const refreshAllSkus = async () => {
    try {
      const rows = await skusApi.getAll();
      setAllSkus(rows);
      return rows;
    } catch {
      setAllSkus([]);
      return [] as Sku[];
    }
  };

  const refreshSkusForLocation = async (locationId: string) => {
    if (!locationId) {
      setSkus([]);
      return [] as Sku[];
    }
    try {
      const rows = await skusApi.getAll({ stockLocationId: locationId });
      setSkus(rows);
      return rows;
    } catch {
      setSkus([]);
      return [] as Sku[];
    }
  };

  const refreshSupplyItems = async () => {
    try {
      const rows = await supplyItemsApi.getAll();
      setSupplyItems(rows);
    } catch {
      setSupplyItems([]);
    }
  };

  const refreshThresholds = async (locationId: string) => {
    if (!locationId) {
      setThresholds([]);
      return;
    }
    try {
      const rows = await locationSupplyThresholdsApi.listByLocation(locationId);
      setThresholds(rows);
    } catch {
      setThresholds([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const locs = await refreshLocations();
      if (cancelled) return;
      unitsOfMeasureApi.getAll().then(setUnits).catch(() => setUnits([]));
      supplyItemsApi.getAll().then(setSupplyItems).catch(() => setSupplyItems([]));
      if (!routeLocationId) {
        await refreshAllSkus();
        if (cancelled) return;
        if (locs.length === 1) {
          navigate(`/stock/${locs[0].id}`, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!routeLocationId) {
      setSkus([]);
      setActionLocationId("");
      setThresholds([]);
      refreshAllSkus();
      return;
    }
    if (locationsLoaded && locations.length > 0 && !locations.some((l) => l.id === routeLocationId)) {
      navigate("/stock", { replace: true });
      return;
    }
    setActionLocationId(routeLocationId);
    refreshSkusForLocation(routeLocationId);
    refreshThresholds(routeLocationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLocationId, locationsLoaded]);

  const refreshActivity = async () => {
    if (!routeLocationId) {
      setTransactions([]);
      return;
    }
    setTransactionsLoading(true);
    try {
      if (activitySkuId) {
        const rows = await stockTransactionsApi.getAll({
          skuId: activitySkuId,
          stockLocationId: routeLocationId,
          limit: 50,
        });
        setTransactions(rows);
      } else {
        const targetSkus = skus.slice(0, 25);
        if (targetSkus.length === 0) {
          setTransactions([]);
        } else {
          const results = await Promise.all(
            targetSkus.map((s) =>
              stockTransactionsApi
                .getAll({
                  skuId: s.id,
                  stockLocationId: routeLocationId,
                  limit: 20,
                })
                .catch(() => [])
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
    if (!isDetail || activeTab !== "activity") return;
    refreshActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, routeLocationId, activitySkuId, skus, isDetail]);

  useEffect(() => {
    setActivitySkuId("");
    setActiveTab("onhand");
  }, [routeLocationId]);

  const summariesByLocation = useMemo(() => {
    const map = new Map<string, LocationSummary>();
    for (const sku of allSkus) {
      const hands = sku.stockOnHands?.length
        ? sku.stockOnHands
        : sku.stockOnHand
          ? [sku.stockOnHand]
          : [];
      for (const soh of hands) {
        const locId = soh.stockLocationId;
        if (!locId) continue;
        const packs = Number(soh.quantity) || 0;
        const prev = map.get(locId) || { skuCount: 0, packsOnHand: 0 };
        map.set(locId, {
          skuCount: prev.skuCount + 1,
          packsOnHand: prev.packsOnHand + packs,
        });
      }
    }
    return map;
  }, [allSkus]);

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
      navigate(`/stock/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create stock location");
    } finally {
      setBusy(false);
    }
  };

  const openReceiveModal = async (locationId: string, skuId?: string) => {
    setActionLocationId(locationId);
    setError("");
    setBusy(true);
    try {
      const [catalogue, atLocation] = await Promise.all([
        skusApi.getAll(),
        skusApi.getAll({ stockLocationId: locationId }),
      ]);
      if (catalogue.length === 0) {
        setError("");
        openSupplyItemModal();
        return;
      }
      const atById = new Map(atLocation.map((s) => [s.id, s]));
      const stockedIds = new Set(atLocation.map((s) => s.id));
      const rows = catalogue
        .map((s) => atById.get(s.id) || s)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setReceiveSkuOptions(rows);
      setReceiveStockedSkuIds(stockedIds);

      const stocked = rows.filter((s) => stockedIds.has(s.id));
      const unstocked = rows.filter((s) => !stockedIds.has(s.id));
      const preferred =
        (skuId && rows.find((s) => s.id === skuId)) ||
        stocked[0] ||
        unstocked[0] ||
        rows[0];
      setReceiveSkuId(preferred?.id || "");
      setReceiveQty("");
      const defaultPrice =
        preferred?.stockOnHand?.lastPurchasePrice != null
          ? String(Number(preferred.stockOnHand.lastPurchasePrice))
          : preferred
            ? String(Number(preferred.purchasePrice))
            : "";
      setReceivePrice(defaultPrice);
      setReceiveDate(localDateInputValue());
      setShowReceiveModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SKUs for receive");
    } finally {
      setBusy(false);
    }
  };

  const receiveSku = receiveSkuOptions.find((s) => s.id === receiveSkuId) || skus.find((s) => s.id === receiveSkuId);
  const receiveUnitRatePreview = (() => {
    const price = Number(receivePrice);
    const pack = receiveSku ? Number(receiveSku.packSize) : 0;
    if (!(price >= 0) || !(pack > 0) || Number.isNaN(price)) return null;
    return price / pack;
  })();

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(receiveQty);
    if (!receiveSkuId) {
      setError("Select a SKU to receive.");
      return;
    }
    if (!selectedLocationId) {
      setError("Select a stock location first.");
      return;
    }
    if (!(qty > 0)) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    const price = Number(receivePrice);
    if (receivePrice === "" || Number.isNaN(price) || price < 0) {
      setError("Purchase price must be zero or greater.");
      return;
    }
    if (!receiveDate) {
      setError("Purchase date is required.");
      return;
    }
    const purchased = new Date(`${receiveDate}T12:00:00`);
    if (Number.isNaN(purchased.getTime())) {
      setError("Purchase date is invalid.");
      return;
    }
    const maxFuture = new Date();
    maxFuture.setDate(maxFuture.getDate() + 1);
    maxFuture.setHours(23, 59, 59, 999);
    if (purchased.getTime() > maxFuture.getTime()) {
      setError("Purchase date cannot be more than 1 day in the future.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await skusApi.receive(receiveSkuId, {
        stockLocationId: selectedLocationId,
        quantity: qty,
        purchasePrice: price,
        purchasedAt: receiveDate,
      });
      setShowReceiveModal(false);
      setReceiveSkuId("");
      setReceiveQty("");
      setReceivePrice("");
      setReceiveDate("");
      if (routeLocationId) {
        await refreshSkusForLocation(routeLocationId);
        await refreshThresholds(routeLocationId);
      }
      await refreshAllSkus();
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
      setSupplyItems((prev) =>
        prev.some((p) => p.id === created.id) ? prev : [...prev, created]
      );
      await refreshSupplyItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add supply item");
    } finally {
      setBusy(false);
    }
  };

  const refreshAfterSupplyEdit = async () => {
    await refreshSupplyItems();
    await refreshAllSkus();
    if (routeLocationId) {
      await refreshSkusForLocation(routeLocationId);
      await refreshThresholds(routeLocationId);
    }
  };

  const openEditSupplyItem = (item: SupplyItem) => {
    setError("");
    setEditingSupplyItem(item);
  };

  const openPropertiesModal = async (locationId: string) => {
    setManageLocationId(locationId);
    setError("");
    setPropertiesBusy(true);
    try {
      const [props, locs] = await Promise.all([propertiesApi.getAll(), refreshLocations()]);
      setTeamProperties(props);
      const loc = locs.find((l) => l.id === locationId);
      const linked = new Set((loc?.properties || []).map((p) => p.propertyId));
      setSelectedPropertyIds(new Set(linked));
      setInitialLinkedPropertyIds(new Set(linked));
      setShowPropertiesModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load properties");
    } finally {
      setPropertiesBusy(false);
    }
  };

  const togglePropertySelection = (propertyId: string) => {
    setSelectedPropertyIds((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  };

  const selectAllProperties = () => {
    setSelectedPropertyIds(new Set(teamProperties.map((p) => p.id)));
  };

  const deselectAllProperties = () => {
    setSelectedPropertyIds(new Set());
  };

  const handleSaveProperties = async () => {
    if (!manageLocationId) return;
    const current = initialLinkedPropertyIds;
    const next = selectedPropertyIds;
    const toLink = [...next].filter((id) => !current.has(id));
    const toUnlink = [...current].filter((id) => !next.has(id));
    setPropertiesBusy(true);
    setError("");
    try {
      await Promise.all([
        ...toLink.map((propertyId) =>
          stockLocationsApi.linkProperty(manageLocationId, propertyId)
        ),
        ...toUnlink.map((propertyId) =>
          stockLocationsApi.unlinkProperty(manageLocationId, propertyId)
        ),
      ]);
      await refreshLocations();
      setShowPropertiesModal(false);
      setManageLocationId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update linked properties");
    } finally {
      setPropertiesBusy(false);
    }
  };

  const unitName = useCallback(
    (unitId?: string) => units.find((u) => u.id === unitId)?.code || "—",
    [units]
  );

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
  }, [skus, supplyItems, unitName]);

  const thresholdBySupplyItem = useMemo(() => {
    const map = new Map<string, LocationSupplyThreshold>();
    for (const t of thresholds) map.set(t.supplyItemId, t);
    return map;
  }, [thresholds]);

  const lowGroupCount = useMemo(() => {
    let n = 0;
    for (const g of onHandGroups) {
      const thr = thresholdBySupplyItem.get(g.supplyItemId);
      const point = Number(thr?.reorderPoint) || 0;
      if (point > 0 && g.baseUnitsOnHand <= point) n += 1;
    }
    return n;
  }, [onHandGroups, thresholdBySupplyItem]);

  const linkedPropertiesSorted = useMemo(() => {
    const linked = teamProperties
      .filter((p) => initialLinkedPropertyIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const other = teamProperties
      .filter((p) => !initialLinkedPropertyIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return { linked, other };
  }, [teamProperties, initialLinkedPropertyIds]);

  const openNewLocationModal = () => {
    setLocationName("");
    setLocationAddress("");
    setError("");
    setShowLocationModal(true);
  };

  if (!isDetail) {
    return (
      <div className="inventory-page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginBottom: "4px" }}>Stock</h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
              Locations hold packs (SKUs) of your supply items. Deploy stock to properties from the Properties page.
            </p>
          </div>
          {canWrite && (
            <button type="button" className="add-property-button" onClick={openNewLocationModal}>
              + New location
            </button>
          )}
        </div>

        <section className="panel">
          {!locationsLoaded ? (
            <p style={{ color: "#64748b", fontSize: "14px" }}>Loading…</p>
          ) : locations.length === 0 ? (
            <div className="empty-state">
              <h3>No stock locations yet</h3>
              <p>Create a stock location to start receiving packs.</p>
              <div style={{ marginTop: "12px" }}>
                {canWrite && (
                  <button type="button" className="add-property-button" onClick={openNewLocationModal}>
                    + New location
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Address</th>
                    <th>Properties</th>
                    <th>SKUs</th>
                    <th>Packs on hand</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc) => {
                    const summary = summariesByLocation.get(loc.id) || {
                      skuCount: 0,
                      packsOnHand: 0,
                    };
                    const propCount = loc.properties?.length || 0;
                    return (
                      <tr
                        key={loc.id}
                        onClick={() => navigate(`/stock/${loc.id}`)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <strong>{loc.name}</strong>
                        </td>
                        <td>{loc.address || "—"}</td>
                        <td>{propCount}</td>
                        <td>{summary.skuCount}</td>
                        <td>{formatQty(summary.packsOnHand)}</td>
                        <td>
                          <div
                            style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canWrite && (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => openReceiveModal(loc.id)}
                              >
                                Receive
                              </button>
                            )}
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => openPropertiesModal(loc.id)}
                            >
                              Properties
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {renderModals()}
      </div>
    );
  }

  const detailLocation = locations.find((l) => l.id === routeLocationId);

  return (
    <div className="inventory-page">
      <div style={{ marginBottom: "8px" }}>
        {locations.length > 1 && (
          <Link to="/stock" style={{ fontSize: "13px", color: "#2563eb", textDecoration: "none" }}>
            ← All locations
          </Link>
        )}
      </div>
      <h2 style={{ marginBottom: "4px" }}>{detailLocation?.name || "Stock location"}</h2>
      <p style={{ marginTop: 0, marginBottom: "16px", color: "#64748b", fontSize: "14px" }}>
        {detailLocation?.address || "Manage packs, catalogue, and activity for this location."}
      </p>

      <div className="stock-toolbar" style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          className="secondary"
          onClick={() => routeLocationId && openPropertiesModal(routeLocationId)}
          disabled={!routeLocationId}
        >
          Linked properties
          {detailLocation?.properties?.length != null
            ? ` (${detailLocation.properties.length})`
            : ""}
        </button>
        {canWrite && (
          <>
            <button type="button" className="secondary" onClick={openNewLocationModal}>
              + New location
            </button>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="add-property-button"
              onClick={() => routeLocationId && openReceiveModal(routeLocationId)}
              disabled={!routeLocationId}
            >
              Receive packs
            </button>
            <button type="button" className="secondary" onClick={openSupplyItemModal}>
              Add supply item
            </button>
          </>
        )}
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
        {activeTab === "onhand" && (
          <>
            <h3 style={{ marginTop: 0 }}>
              On hand
              {lowGroupCount > 0 ? (
                <span
                  style={{
                    marginLeft: "10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#b45309",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: "999px",
                    padding: "2px 8px",
                  }}
                >
                  {lowGroupCount} low
                </span>
              ) : null}
            </h3>
            <p style={{ marginTop: "-4px", color: "#64748b", fontSize: "13px" }}>
              Grouped by supply item. Totals are equivalent base units across all pack sizes.
              Edit a supply item to set reorder thresholds for this location.
            </p>
            {skus.length === 0 ? (
              <div className="empty-state">
                <h3>Nothing here yet</h3>
                <p>Add a supply item, then receive packs to see stock on hand.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {onHandGroups.map((group) => {
                  const thr = thresholdBySupplyItem.get(group.supplyItemId);
                  const point = Number(thr?.reorderPoint) || 0;
                  const isLow = point > 0 && group.baseUnitsOnHand <= point;
                  return (
                  <div
                    key={group.supplyItemId}
                    style={{
                      border: isLow ? "1px solid #fbbf24" : "1px solid #e2e8f0",
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
                        background: isLow ? "#fffbeb" : "#f8fafc",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: "15px" }}>{group.name}</strong>
                        {isLow ? (
                          <span
                            style={{
                              marginLeft: "8px",
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "#b45309",
                            }}
                          >
                            Low stock
                          </span>
                        ) : null}
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
                          {point > 0 ? (
                            <span style={{ color: "#64748b" }}>
                              {" "}
                              · Reorder at {formatQty(point)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {canWrite && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              const item = supplyItems.find((s) => s.id === group.supplyItemId);
                              if (item) openEditSupplyItem(item);
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
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
                                  {canWrite && (
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() =>
                                        routeLocationId && openReceiveModal(routeLocationId, sku.id)
                                      }
                                    >
                                      Receive
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === "catalogue" && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <h3 style={{ margin: 0 }}>Supply items</h3>
              {canWrite && (
                <button type="button" className="secondary" onClick={openSupplyItemModal}>
                  Add supply item
                </button>
              )}
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
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplyItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.category || "—"}</td>
                        <td>{item.baseUnit?.code || unitName(item.baseUnitId)}</td>
                        <td>
                          {canWrite && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => openEditSupplyItem(item)}
                            >
                              Edit
                            </button>
                          )}
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <h3 style={{ margin: 0 }}>Activity</h3>
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
                      <th>Price / date</th>
                      <th>Reason</th>
                      <th>By</th>
                      <th>Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const businessDate = t.effectiveAt || t.createdAt;
                      const priceBits =
                        t.transactionType === "receipt" && t.unitPrice != null
                          ? `$${Number(t.unitPrice).toFixed(2)}/pack · ${new Date(businessDate).toLocaleDateString()}`
                          : t.effectiveAt
                            ? new Date(t.effectiveAt).toLocaleDateString()
                            : "—";
                      return (
                        <tr key={t.id}>
                          <td>{t.transactionType.replace(/_/g, " ")}</td>
                          <td>
                            {Number(t.quantityDelta) > 0 ? "+" : ""}
                            {Number(t.quantityDelta).toFixed(2)}
                          </td>
                          <td>{priceBits}</td>
                          <td>{t.reason || "—"}</td>
                          <td>{actorDisplayName(t.createdByUser)}</td>
                          <td>{new Date(t.createdAt).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {renderModals()}
    </div>
  );

  function renderModals() {
    const actionLocation = locations.find((l) => l.id === selectedLocationId);
    return (
      <>
        {showLocationModal && (
          <div className="modal-overlay" onClick={() => !busy && setShowLocationModal(false)}>
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "420px" }}
            >
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
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowLocationModal(false)}
                    disabled={busy}
                  >
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
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "480px" }}
            >
              <h3 style={{ marginTop: 0 }}>Receive packs</h3>
              <p style={{ marginTop: 0, color: "#64748b", fontSize: "13px" }}>
                Record what you paid for this purchase. The SKU’s unit rate updates for future
                replenish bill-back.
                {actionLocation ? ` · ${actionLocation.name}` : ""}
                {" "}You can also receive a catalogue SKU that is not tracked here yet.
              </p>
              <form className="inventory-form" onSubmit={handleReceive}>
                <label>
                  <span>SKU *</span>
                  <select
                    value={receiveSkuId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setReceiveSkuId(id);
                      const sku = receiveSkuOptions.find((s) => s.id === id);
                      if (sku) {
                        const price =
                          sku.stockOnHand?.lastPurchasePrice != null
                            ? String(Number(sku.stockOnHand.lastPurchasePrice))
                            : String(Number(sku.purchasePrice));
                        setReceivePrice(price);
                      }
                    }}
                    required
                  >
                    <option value="">Select SKU…</option>
                    {(() => {
                      const stocked = receiveSkuOptions.filter((s) =>
                        receiveStockedSkuIds.has(s.id)
                      );
                      const unstocked = receiveSkuOptions.filter(
                        (s) => !receiveStockedSkuIds.has(s.id)
                      );
                      return (
                        <>
                          {stocked.length > 0 && (
                            <optgroup label="At this location">
                              {stocked.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                  {s.supplyItem?.name ? ` · ${s.supplyItem.name}` : ""}
                                  {s.stockOnHand
                                    ? ` (${Number(s.stockOnHand.quantity).toFixed(2)} on hand)`
                                    : ""}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {unstocked.length > 0 && (
                            <optgroup label="Not at this location yet">
                              {unstocked.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                  {s.supplyItem?.name ? ` · ${s.supplyItem.name}` : ""}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
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
                <label>
                  <span>Purchase price (per pack) *</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={receivePrice}
                    onChange={(e) => setReceivePrice(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Purchase date *</span>
                  <input
                    type="date"
                    value={receiveDate}
                    onChange={(e) => setReceiveDate(e.target.value)}
                    required
                  />
                </label>
                {receiveUnitRatePreview != null && receiveSku && (
                  <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 8px" }}>
                    Unit rate: ${receiveUnitRatePreview.toFixed(4)} / base unit
                    {receiveSku.packSize
                      ? ` (pack size ${Number(receiveSku.packSize)})`
                      : ""}
                  </p>
                )}
                {error && <p style={{ color: "#b91c1c", fontSize: "14px" }}>{error}</p>}
                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowReceiveModal(false)}
                    disabled={busy}
                  >
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
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "480px" }}
            >
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
                    No units of measure found. Run database migrations so seeded units (ea, pack, …)
                    are available.
                  </p>
                )}
                {error && <p style={{ color: "#b91c1c", fontSize: "14px" }}>{error}</p>}
                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowSupplyItemModal(false)}
                    disabled={busy}
                  >
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

        {showPropertiesModal && (
          <div
            className="modal-overlay"
            onClick={() => !propertiesBusy && setShowPropertiesModal(false)}
          >
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "520px" }}
            >
              <h3 style={{ marginTop: 0 }}>
                Linked properties
                {manageLocation ? ` · ${manageLocation.name}` : ""}
              </h3>
              <p style={{ marginTop: 0, color: "#64748b", fontSize: "13px" }}>
                {canWrite
                  ? "Choose which properties this stock location can supply."
                  : "Properties this stock location can supply."}
              </p>
              {canWrite && (
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginBottom: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className="secondary"
                    onClick={selectAllProperties}
                    disabled={propertiesBusy || teamProperties.length === 0}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={deselectAllProperties}
                    disabled={propertiesBusy || selectedPropertyIds.size === 0}
                  >
                    Deselect all
                  </button>
                </div>
              )}
              {teamProperties.length === 0 ? (
                <p style={{ color: "#64748b", fontSize: "14px" }}>
                  No properties yet. Add properties from the Properties page.
                </p>
              ) : (
                <div
                  style={{
                    maxHeight: "360px",
                    overflowY: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 12px",
                  }}
                >
                  {linkedPropertiesSorted.linked.length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#64748b",
                          marginBottom: "6px",
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                        }}
                      >
                        Currently linked
                      </div>
                      {linkedPropertiesSorted.linked.map((p) => (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "6px 0",
                            cursor: canWrite ? "pointer" : "default",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPropertyIds.has(p.id)}
                            onChange={() => togglePropertySelection(p.id)}
                            disabled={propertiesBusy || !canWrite}
                          />
                          <span>
                            {p.name}
                            {p.location ? (
                              <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                                {" "}
                                · {p.location}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {linkedPropertiesSorted.other.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#64748b",
                          marginBottom: "6px",
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {linkedPropertiesSorted.linked.length > 0
                          ? "Other properties"
                          : "Properties"}
                      </div>
                      {linkedPropertiesSorted.other.map((p) => (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "6px 0",
                            cursor: canWrite ? "pointer" : "default",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPropertyIds.has(p.id)}
                            onChange={() => togglePropertySelection(p.id)}
                            disabled={propertiesBusy || !canWrite}
                          />
                          <span>
                            {p.name}
                            {p.location ? (
                              <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                                {" "}
                                · {p.location}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {error && <p style={{ color: "#b91c1c", fontSize: "14px" }}>{error}</p>}
              <div className="form-actions" style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowPropertiesModal(false)}
                  disabled={propertiesBusy}
                >
                  {canWrite ? "Cancel" : "Close"}
                </button>
                {canWrite && (
                  <button
                    type="button"
                    onClick={handleSaveProperties}
                    disabled={propertiesBusy}
                  >
                    {propertiesBusy ? "Saving…" : "Save"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {editingSupplyItem && (
          <EditSupplyItemModal
            supplyItem={editingSupplyItem}
            units={units}
            locationId={routeLocationId}
            locationName={
              locations.find((l) => l.id === (routeLocationId || actionLocationId))?.name
            }
            existingThreshold={
              routeLocationId
                ? thresholds.find((t) => t.supplyItemId === editingSupplyItem.id) || null
                : null
            }
            onClose={() => setEditingSupplyItem(null)}
            onSaved={refreshAfterSupplyEdit}
          />
        )}

      </>
    );
  }
};
