import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  LocationSupplyThreshold,
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
import { useAuth } from "../contexts/useAuth";
import { EditSupplyItemModal } from "../components/EditSupplyItemModal";
import { EditStockLocationModal } from "../components/EditStockLocationModal";
import { OverflowNameList } from "../components/OverflowNameList";
import { ActionMenu, Badge, Button, EmptyState, FormField, Icon, Modal, Tabs } from "../components/ui";
import { isCategoryVisible } from "../utils/stockLocationVisibility";
import { formatQty as formatQtyShared } from "../utils/format";

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
  categories: string[];
  propertyNames: string[];
};

const UNCATEGORIZED_LABEL = "Uncategorized Items";

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
  const [editingLocation, setEditingLocation] = useState<StockLocation | null>(null);
  const [receiveStockedSkuIds, setReceiveStockedSkuIds] = useState<Set<string>>(new Set());
  const [thresholds, setThresholds] = useState<LocationSupplyThreshold[]>([]);
  const [showAllSkusByGroup, setShowAllSkusByGroup] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedLocationId = routeLocationId || actionLocationId;

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
      await refreshLocations();
      if (cancelled) return;
      unitsOfMeasureApi.getAll().then(setUnits).catch(() => setUnits([]));
      supplyItemsApi.getAll().then(setSupplyItems).catch(() => setSupplyItems([]));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!routeLocationId) {
      setSkus([]);
      setActionLocationId("");
      setThresholds([]);
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
    setShowAllSkusByGroup(new Set());
  }, [routeLocationId]);

  const summariesByLocation = useMemo(() => {
    const namedCategories = [
      ...new Set(
        supplyItems
          .map((s) => (s.category || "").trim())
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    const result = new Map<string, LocationSummary>();
    for (const loc of locations) {
      const categories: string[] = [];
      if (loc.visibleCategories == null) {
        categories.push(...namedCategories);
      } else {
        categories.push(
          ...loc.visibleCategories
            .map((c) => c.trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        );
      }
      if (loc.showUncategorized !== false) {
        categories.push(UNCATEGORIZED_LABEL);
      }
      const propertyNames = (loc.properties || [])
        .map((p) => p.property?.name?.trim() || "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      result.set(loc.id, { categories, propertyNames });
    }
    return result;
  }, [locations, supplyItems]);

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
    if (routeLocationId) {
      await refreshSkusForLocation(routeLocationId);
      await refreshThresholds(routeLocationId);
    }
  };

  const openEditSupplyItem = (item: SupplyItem) => {
    setError("");
    setEditingSupplyItem(item);
  };

  const openEditLocation = (loc: StockLocation) => {
    setError("");
    setEditingLocation(loc);
  };

  const unitName = useCallback(
    (unitId?: string) => units.find((u) => u.id === unitId)?.code || "—",
    [units]
  );

  const visibilityLoc = useMemo(
    () =>
      locations.find((l) => l.id === routeLocationId) ||
      ({
        visibleCategories: null,
        showUncategorized: true,
      } as Pick<StockLocation, "visibleCategories" | "showUncategorized">),
    [locations, routeLocationId]
  );

  const onHandGroups = useMemo((): OnHandGroup[] => {
    const byId = new Map<string, OnHandGroup>();

    for (const item of supplyItems) {
      if (!isCategoryVisible(item.category, visibilityLoc)) continue;
      byId.set(item.id, {
        supplyItemId: item.id,
        name: item.name,
        category: item.category || "",
        baseUnitLabel: item.baseUnit?.code || unitName(item.baseUnitId) || "units",
        skus: [],
        packsOnHand: 0,
        baseUnitsOnHand: 0,
      });
    }

    for (const sku of skus) {
      const supplyItemId = sku.supplyItemId || sku.supplyItem?.id || "unknown";
      const fromCatalogue = supplyItems.find((s) => s.id === supplyItemId);
      const category = sku.supplyItem?.category || fromCatalogue?.category || "";
      if (!isCategoryVisible(category, visibilityLoc)) continue;
      const name =
        sku.supplyItem?.name || fromCatalogue?.name || "Unknown supply item";
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
  }, [skus, supplyItems, unitName, visibilityLoc]);

  const visibleSupplyItems = useMemo(
    () => supplyItems.filter((item) => isCategoryVisible(item.category, visibilityLoc)),
    [supplyItems, visibilityLoc]
  );

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

  const onHandByCategory = useMemo(() => {
    const map = new Map<string, OnHandGroup[]>();
    for (const group of onHandGroups) {
      const key = (group.category || "").trim() || UNCATEGORIZED_LABEL;
      const list = map.get(key) || [];
      list.push(group);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === UNCATEGORIZED_LABEL) return 1;
        if (b === UNCATEGORIZED_LABEL) return -1;
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      })
      .map(([category, groups]) => ({
        category,
        groups: [...groups].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        ),
      }));
  }, [onHandGroups]);

  const toggleShowAllSkus = (supplyItemId: string) => {
    setShowAllSkusByGroup((prev) => {
      const next = new Set(prev);
      if (next.has(supplyItemId)) next.delete(supplyItemId);
      else next.add(supplyItemId);
      return next;
    });
  };

  const openNewLocationModal = () => {
    setLocationName("");
    setLocationAddress("");
    setError("");
    setShowLocationModal(true);
  };

  if (!isDetail) {
    return (
      <div className="inventory-page">
        <div className="stock-page-header">
          <h2 className="stock-page-title">Stock Locations</h2>
          {canWrite && (
            <Button onClick={openNewLocationModal}>New location</Button>
          )}
        </div>

        <section className="panel">
          {!locationsLoaded ? (
            <p className="stock-page-loading">Loading…</p>
          ) : locations.length === 0 ? (
            <EmptyState
              title="No stock locations yet"
              body="Create a stock location to start receiving packs."
              primaryLabel={canWrite ? "New location" : undefined}
              onPrimary={canWrite ? openNewLocationModal : undefined}
            />
          ) : (
            <div className="table-wrapper">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Address</th>
                    <th>Properties</th>
                    <th>Categories</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc) => {
                    const summary = summariesByLocation.get(loc.id);
                    const propertyNames = summary?.propertyNames || [];
                    const categoryNames = summary?.categories || [];
                    return (
                      <tr
                        key={loc.id}
                        className="stock-location-row"
                        onClick={() => navigate(`/stock/${loc.id}`)}
                      >
                        <td>
                          <strong>{loc.name}</strong>
                        </td>
                        <td>{loc.address || "—"}</td>
                        <td className="overflow-name-cell">
                          <OverflowNameList names={propertyNames} />
                        </td>
                        <td className="overflow-name-cell">
                          <OverflowNameList names={categoryNames} />
                        </td>
                        <td>
                          <div className="row-actions stock-row-actions" onClick={(e) => e.stopPropagation()}>
                            <ActionMenu
                              ariaLabel={`Manage ${loc.name}`}
                              items={[
                                {
                                  label: "Edit stock location",
                                  onSelect: () => openEditLocation(loc),
                                },
                              ]}
                            />
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
      <div className="stock-page-backlink-row">
        {locations.length > 1 && (
          <Link to="/stock" className="stock-page-backlink">
            <Icon name="back" size={14} />
            All locations
          </Link>
        )}
      </div>
      <div className="stock-page-detail-header">
        <h2 className="stock-page-title">{detailLocation?.name || "Stock location"}</h2>
        <div className="stock-page-actions">
          {canWrite && detailLocation ? (
            <ActionMenu
              ariaLabel={`Manage ${detailLocation.name}`}
              items={[
                {
                  label: "Edit stock location",
                  onSelect: () => openEditLocation(detailLocation),
                },
              ]}
            />
          ) : null}
        </div>
      </div>
      <p className="stock-page-description">
        {detailLocation?.address || "Manage packs, catalogue, and activity for this location."}
      </p>

      <Tabs
        items={[
          { key: "onhand", label: "On hand", count: onHandGroups.length },
          { key: "catalogue", label: "Catalogue", count: visibleSupplyItems.length },
          { key: "activity", label: "Activity" },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      <section className="panel">
        {activeTab === "onhand" && (
          <>
            {lowGroupCount > 0 ? (
              <div className="stock-page-low-summary">
                <Badge tone="warning">{lowGroupCount} low</Badge>
              </div>
            ) : null}
            {visibleSupplyItems.length === 0 ? (
              supplyItems.length === 0 ? (
                <EmptyState
                  title="Nothing here yet"
                  body="Add a supply item, then receive packs to see stock on hand."
                  primaryLabel={canWrite ? "New supply item" : undefined}
                  onPrimary={canWrite ? openSupplyItemModal : undefined}
                />
              ) : (
                <EmptyState
                  title="No visible stock"
                  body="Nothing matches this location’s category filters."
                  primaryLabel={canWrite ? "New supply item" : undefined}
                  onPrimary={canWrite ? openSupplyItemModal : undefined}
                  secondaryLabel={detailLocation ? "Edit stock location" : undefined}
                  onSecondary={
                    detailLocation ? () => openEditLocation(detailLocation) : undefined
                  }
                />
              )
            ) : (
              <div className="stock-onhand-groups">
                {onHandByCategory.map(({ category, groups }) => (
                  <div key={category} className="stock-category-section">
                    <h4 className="stock-category-title">{category}</h4>
                    <div className="stock-category-groups">
                      {groups.map((group) => {
                        const thr = thresholdBySupplyItem.get(group.supplyItemId);
                        const point = Number(thr?.reorderPoint) || 0;
                        const isLow = point > 0 && group.baseUnitsOnHand <= point;
                        const zeroSkus = group.skus.filter(
                          (sku) => !(sku.stockOnHand ? Number(sku.stockOnHand.quantity) || 0 : 0)
                        );
                        const positiveSkus = group.skus.filter(
                          (sku) => (sku.stockOnHand ? Number(sku.stockOnHand.quantity) || 0 : 0) > 0
                        );
                        const showAll =
                          showAllSkusByGroup.has(group.supplyItemId) || positiveSkus.length === 0;
                        const visibleSkus = showAll ? group.skus : positiveSkus;
                        const hasNoSkus = group.skus.length === 0;
                        const canToggleZeroSkus = positiveSkus.length > 0 && zeroSkus.length > 0;
                        return (
                          <div
                            key={group.supplyItemId}
                            className={isLow ? "stock-group-card is-low" : "stock-group-card"}
                          >
                            <div className="stock-group-card-header">
                              <div>
                                <strong className="stock-group-name">{group.name}</strong>
                                {isLow ? (
                                  <Badge tone="warning" className="stock-group-badge">
                                    Low stock
                                  </Badge>
                                ) : null}
                                <div className="stock-group-meta">
                                  <span>
                                    ≈ {formatQty(group.baseUnitsOnHand)} {group.baseUnitLabel}
                                  </span>
                                  <span className="stock-group-meta-muted">
                                    {" "}
                                    · {formatQty(group.packsOnHand)} packs · {group.skus.length}{" "}
                                    SKU
                                    {group.skus.length === 1 ? "" : "s"}
                                  </span>
                                  {point > 0 ? (
                                    <span className="stock-group-meta-note">
                                      {" "}
                                      · Reorder at {formatQty(point)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="row-actions stock-row-actions">
                                {canWrite && (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      const item = supplyItems.find(
                                        (s) => s.id === group.supplyItemId
                                      );
                                      if (item) openEditSupplyItem(item);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                )}
                              </div>
                            </div>
                            {hasNoSkus ? (
                              <div className="stock-group-card-body">
                                <EmptyState
                                  title="No SKUs"
                                  body="Add a SKU to start receiving packs for this item."
                                  primaryLabel={canWrite ? "Add SKU" : undefined}
                                  onPrimary={
                                    canWrite
                                      ? () => {
                                          const item = supplyItems.find(
                                            (s) => s.id === group.supplyItemId
                                          );
                                          if (item) openEditSupplyItem(item);
                                        }
                                      : undefined
                                  }
                                />
                              </div>
                            ) : (
                              <>
                                <div className="table-wrapper stock-table-wrapper">
                                  <table className="inventory-table">
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
                                      {visibleSkus.map((sku) => {
                                        const packs = sku.stockOnHand
                                          ? Number(sku.stockOnHand.quantity) || 0
                                          : 0;
                                        const packSize = Number(sku.packSize) || 0;
                                        return (
                                          <tr key={sku.id}>
                                            <td>
                                              <div className="primary-cell">
                                                <span className="primary-text">{sku.name}</span>
                                              {sku.supplier ? (
                                                  <span className="secondary-text">{sku.supplier}</span>
                                              ) : null}
                                              </div>
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
                                                <Button
                                                  type="button"
                                                  variant="secondary"
                                                  size="sm"
                                                  onClick={() =>
                                                    routeLocationId &&
                                                    openReceiveModal(routeLocationId, sku.id)
                                                  }
                                                >
                                                  Receive
                                                </Button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                {canToggleZeroSkus ? (
                                  <div className="stock-group-card-footer">
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => toggleShowAllSkus(group.supplyItemId)}
                                    >
                                      {showAllSkusByGroup.has(group.supplyItemId)
                                        ? "Hide zero-qty SKUs"
                                        : `Show all SKUs (${zeroSkus.length} hidden)`}
                                    </Button>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "catalogue" && (
          <>
            {supplyItems.length === 0 ? (
              <EmptyState
                title="No supply items yet"
                body="Add a supply item to start building your catalogue."
                primaryLabel={canWrite ? "New supply item" : undefined}
                onPrimary={canWrite ? openSupplyItemModal : undefined}
              />
            ) : visibleSupplyItems.length === 0 ? (
              <EmptyState
                title="No visible supply items"
                body="Catalogue items are hidden by this location’s category filters."
                primaryLabel={canWrite ? "New supply item" : undefined}
                onPrimary={canWrite ? openSupplyItemModal : undefined}
                secondaryLabel={detailLocation ? "Edit stock location" : undefined}
                onSecondary={
                  detailLocation ? () => openEditLocation(detailLocation) : undefined
                }
              />
            ) : (
              <>
                <div className="table-wrapper">
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Base unit</th>
                        <th>Reorder point</th>
                        <th>Suggested buy qty</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSupplyItems.map((item) => {
                        const thr = thresholdBySupplyItem.get(item.id);
                        const unit = item.baseUnit?.code || unitName(item.baseUnitId);
                        return (
                          <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>{item.category || "—"}</td>
                            <td>{unit}</td>
                            <td>
                              {thr
                                ? `${formatQty(Number(thr.reorderPoint))} ${unit}`
                                : "—"}
                            </td>
                            <td>
                              {thr
                                ? `${formatQty(Number(thr.reorderQuantity))} ${unit}`
                                : "—"}
                            </td>
                            <td>
                              {canWrite && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => openEditSupplyItem(item)}
                                >
                                  Edit
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {canWrite && (
                  <div className="stock-page-footer-action">
                    <Button type="button" variant="secondary" onClick={openSupplyItemModal}>
                      New supply item
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "activity" && (
          <>
            <div className="stock-page-filter">
              <FormField label="Filter by SKU" className="stock-page-filter-field">
                {(inputProps) => (
                  <select
                    {...inputProps}
                    value={activitySkuId}
                    onChange={(e) => setActivitySkuId(e.target.value)}
                    className="stock-page-filter-input"
                  >
                    <option value="">All SKUs at this location</option>
                    {skus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>
            {transactionsLoading ? (
              <p className="stock-page-loading">Loading…</p>
            ) : transactions.length === 0 ? (
              <EmptyState
                title="No activity yet"
                body="Receipts, adjustments, and replenishments will show up here."
              />
            ) : (
              <div className="table-wrapper">
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
        <Modal
          open={showLocationModal}
          onClose={() => setShowLocationModal(false)}
          title="Add stock location"
          maxWidth="420px"
          busy={busy}
        >
          <form className="inventory-form stacked-form" onSubmit={handleCreateLocation}>
            <FormField label="Name" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g. Central Supply"
                  required
                />
              )}
            </FormField>
            <FormField label="Address">
              {(inputProps) => (
                <input
                  {...inputProps}
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  placeholder="Optional"
                />
              )}
            </FormField>
            {error ? (
              <p className="form-banner error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowLocationModal(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Create"}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal
          open={showReceiveModal}
          onClose={() => setShowReceiveModal(false)}
          title="Receive packs"
          maxWidth="480px"
          busy={busy}
        >
          <p className="modal-intro">
            Record what you paid for this purchase. The SKU’s unit rate updates for future
            replenish bill-back.
            {actionLocation ? ` · ${actionLocation.name}` : ""}
            {" "}You can also receive a catalogue SKU that is not tracked here yet.
          </p>
          <form className="inventory-form stacked-form" onSubmit={handleReceive}>
            <FormField label="SKU" required>
              {(inputProps) => (
                <select
                  {...inputProps}
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
              )}
            </FormField>
            <div className="form-grid stock-modal-grid">
              <FormField label="Quantity (packs)" required>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="number"
                    min="0"
                    step="any"
                    value={receiveQty}
                    onChange={(e) => setReceiveQty(e.target.value)}
                    required
                  />
                )}
              </FormField>
              <FormField label="Purchase price (per pack)" required>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="number"
                    min="0"
                    step="any"
                    value={receivePrice}
                    onChange={(e) => setReceivePrice(e.target.value)}
                    required
                  />
                )}
              </FormField>
              <FormField label="Purchase date" required>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="date"
                    value={receiveDate}
                    onChange={(e) => setReceiveDate(e.target.value)}
                    required
                  />
                )}
              </FormField>
            </div>
            {receiveUnitRatePreview != null && receiveSku ? (
              <p className="stock-form-note">
                Unit rate: ${receiveUnitRatePreview.toFixed(4)} / base unit
                {receiveSku.packSize ? ` (pack size ${Number(receiveSku.packSize)})` : ""}
              </p>
            ) : null}
            {error ? (
              <p className="form-banner error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowReceiveModal(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Receiving…" : "Receive"}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal
          open={showSupplyItemModal}
          onClose={() => setShowSupplyItemModal(false)}
          title="Add supply item"
          maxWidth="480px"
          busy={busy}
        >
          <form className="inventory-form stacked-form" onSubmit={handleCreateSupplyItem}>
            <div className="form-grid stock-modal-grid">
              <FormField label="Name" required>
                {(inputProps) => (
                  <input
                    {...inputProps}
                    value={supplyItemName}
                    onChange={(e) => setSupplyItemName(e.target.value)}
                    placeholder="e.g. Toilet paper"
                    required
                  />
                )}
              </FormField>
              <FormField label="Category">
                {(inputProps) => (
                  <input
                    {...inputProps}
                    value={supplyItemCategory}
                    onChange={(e) => setSupplyItemCategory(e.target.value)}
                    placeholder="Optional"
                  />
                )}
              </FormField>
              <FormField label="Base unit" required>
                {(inputProps) => (
                  <select
                    {...inputProps}
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
                )}
              </FormField>
            </div>
            {units.length === 0 ? (
              <p className="form-banner stock-form-warning">
                No units of measure found. Run database migrations so seeded units (ea, pack, …)
                are available.
              </p>
            ) : null}
            {error ? (
              <p className="form-banner error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowSupplyItemModal(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Add"}
              </Button>
            </div>
          </form>
        </Modal>

        {editingLocation && (
          <EditStockLocationModal
            location={editingLocation}
            supplyItems={supplyItems}
            canWrite={canWrite}
            onClose={() => setEditingLocation(null)}
            onSaved={async () => {
              const locs = await refreshLocations();
              const updated = locs.find((l) => l.id === editingLocation.id);
              if (updated) setEditingLocation(updated);
            }}
          />
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
