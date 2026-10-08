import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../config/api";
import {
  skusApi,
  stockTransactionsApi,
} from "../services/catalogueApi";
import { stockLocationsApi } from "../services/stockLocationsApi";
import type {
  LocationSupplyThreshold,
  Sku,
  StockLocation,
  StockTransaction,
} from "../types";
import { Button, EmptyState, SectionHeader } from "../components/ui";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const TRANSACTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "receipt", label: "Receipt" },
  { value: "adjustment", label: "Adjustment" },
  { value: "replenishment_out", label: "Replenishment out" },
  { value: "replenishment_in", label: "Replenishment in" },
  { value: "invoice", label: "Invoice" },
];

const transactionTypeLabel: Record<string, string> = {
  receipt: "Receipt",
  adjustment: "Adjustment",
  replenishment_out: "Replenishment out",
  replenishment_in: "Replenishment in",
  invoice: "Invoice",
};

const REPORT_TRANSACTION_LIMIT = 1000;

const getTransactionBusinessDate = (transaction: StockTransaction) =>
  transaction.effectiveAt || transaction.createdAt;

const listAllLocationSupplyThresholds = async (): Promise<LocationSupplyThreshold[]> =>
  apiRequest<LocationSupplyThreshold[]>("/stock-location-supply-thresholds");

function escapeCsvCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type LocationOnHandRow = {
  key: string;
  stockLocationId: string;
  locationName: string;
  supplyItemId: string;
  supplyItemName: string;
  category: string;
  onHandBase: number;
  reorderPoint: number;
  status: "OK" | "Low stock" | "Out of stock";
};

function statusFor(onHand: number, reorderPoint: number): LocationOnHandRow["status"] {
  if (onHand <= 0) return "Out of stock";
  if (reorderPoint > 0 && onHand <= reorderPoint) return "Low stock";
  return "OK";
}

export const ReportsPage: React.FC = () => {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [thresholdsByLocation, setThresholdsByLocation] = useState<
    Map<string, LocationSupplyThreshold[]>
  >(new Map());
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [stockError, setStockError] = useState<string | null>(null);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("");

  const [transactionTypeFilter, setTransactionTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const isMountedRef = useRef(true);
  const stockRequestIdRef = useRef(0);
  const transactionRequestIdRef = useRef(0);

  useEffect(() => () => {
    isMountedRef.current = false;
    stockRequestIdRef.current += 1;
    transactionRequestIdRef.current += 1;
  }, []);

  const loadStocks = useCallback(() => {
    const requestId = ++stockRequestIdRef.current;
    setLoadingStocks(true);
    setStockError(null);

    Promise.all([stockLocationsApi.getAll(), skusApi.getAll(), listAllLocationSupplyThresholds()])
      .then(([locs, allSkus, thresholds]) => {
        if (!isMountedRef.current || requestId !== stockRequestIdRef.current) {
          return;
        }
        setLocations(locs);
        setSkus(allSkus);
        const entries = new Map<string, LocationSupplyThreshold[]>();
        for (const loc of locs) {
          entries.set(loc.id, []);
        }
        for (const row of thresholds) {
          const current = entries.get(row.stockLocationId) || [];
          current.push(row);
          entries.set(row.stockLocationId, current);
        }
        for (const [locationId, rows] of entries) {
          rows.sort((a, b) => {
            const aName = a.supplyItem?.name || "";
            const bName = b.supplyItem?.name || "";
            return aName.localeCompare(bName, undefined, { sensitivity: "base" });
          });
          entries.set(locationId, rows);
        }
        setThresholdsByLocation(entries);
      })
      .catch(() => {
        if (!isMountedRef.current || requestId !== stockRequestIdRef.current) {
          return;
        }
        setLocations([]);
        setSkus([]);
        setThresholdsByLocation(new Map());
        setStockError("Failed to load location stock.");
      })
      .finally(() => {
        if (!isMountedRef.current || requestId !== stockRequestIdRef.current) {
          return;
        }
        setLoadingStocks(false);
      });
  }, []);

  useEffect(() => {
    loadStocks();
  }, [loadStocks]);

  const loadTransactions = useCallback(() => {
    const requestId = ++transactionRequestIdRef.current;
    setLoadingTransactions(true);
    setTransactionsError(null);
    stockTransactionsApi
      .getAll({
        transactionType: transactionTypeFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: REPORT_TRANSACTION_LIMIT,
      })
      .then((rows) => {
        if (!isMountedRef.current || requestId !== transactionRequestIdRef.current) {
          return;
        }
        setTransactions(rows);
      })
      .catch(() => {
        if (!isMountedRef.current || requestId !== transactionRequestIdRef.current) {
          return;
        }
        setTransactions([]);
        setTransactionsError("Failed to load transactions.");
      })
      .finally(() => {
        if (!isMountedRef.current || requestId !== transactionRequestIdRef.current) {
          return;
        }
        setLoadingTransactions(false);
      });
  }, [transactionTypeFilter, fromDate, toDate]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const skuByStockOnHandId = useMemo(() => {
    const map = new Map<string, { sku: Sku; locationName: string }>();
    for (const sku of skus) {
      const hands = sku.stockOnHands?.length
        ? sku.stockOnHands
        : sku.stockOnHand
          ? [sku.stockOnHand]
          : [];
      for (const soh of hands) {
        map.set(soh.id, {
          sku,
          locationName: soh.stockLocation?.name || "Location",
        });
      }
    }
    return map;
  }, [skus]);

  const describeEntity = (row: StockTransaction): string => {
    if (row.entityType === "property_stock") {
      return "Property stock (archived)";
    }
    const hit = skuByStockOnHandId.get(row.entityId);
    if (hit) return `${hit.sku.name} @ ${hit.locationName}`;
    return "Stock on hand";
  };

  const locationOnHandRows = useMemo((): LocationOnHandRow[] => {
    const agg = new Map<
      string,
      {
        stockLocationId: string;
        locationName: string;
        supplyItemId: string;
        supplyItemName: string;
        category: string;
        onHandBase: number;
      }
    >();

    for (const sku of skus) {
      const supplyItemId = sku.supplyItemId || sku.supplyItem?.id;
      if (!supplyItemId) continue;
      const hands = sku.stockOnHands?.length
        ? sku.stockOnHands
        : sku.stockOnHand
          ? [sku.stockOnHand]
          : [];
      for (const soh of hands) {
        const locId = soh.stockLocationId;
        const key = `${locId}::${supplyItemId}`;
        const packs = Number(soh.quantity) || 0;
        const packSize = Number(sku.packSize) || 0;
        const base = packs * packSize;
        const existing = agg.get(key);
        if (existing) {
          existing.onHandBase += base;
        } else {
          agg.set(key, {
            stockLocationId: locId,
            locationName:
              soh.stockLocation?.name ||
              locations.find((l) => l.id === locId)?.name ||
              "Location",
            supplyItemId,
            supplyItemName: sku.supplyItem?.name || "Supply item",
            category: (sku.supplyItem?.category || "").trim(),
            onHandBase: base,
          });
        }
      }
    }

    for (const [locId, thresholds] of thresholdsByLocation) {
      for (const t of thresholds) {
        const key = `${locId}::${t.supplyItemId}`;
        if (!agg.has(key)) {
          agg.set(key, {
            stockLocationId: locId,
            locationName:
              t.stockLocation?.name ||
              locations.find((l) => l.id === locId)?.name ||
              "Location",
            supplyItemId: t.supplyItemId,
            supplyItemName: t.supplyItem?.name || "Supply item",
            category: (t.supplyItem?.category || "").trim(),
            onHandBase: Number(t.onHandBase) || 0,
          });
        }
      }
    }

    let rows: LocationOnHandRow[] = Array.from(agg.entries()).map(([key, row]) => {
      const thresholds = thresholdsByLocation.get(row.stockLocationId) || [];
      const thr = thresholds.find((t) => t.supplyItemId === row.supplyItemId);
      const reorderPoint = Number(thr?.reorderPoint) || 0;
      return {
        key,
        ...row,
        reorderPoint,
        status: statusFor(row.onHandBase, reorderPoint),
      };
    });

    if (locationFilter) rows = rows.filter((r) => r.stockLocationId === locationFilter);
    if (categoryFilter) rows = rows.filter((r) => r.category === categoryFilter);
    if (stockStatusFilter === "low") rows = rows.filter((r) => r.status === "Low stock");
    if (stockStatusFilter === "out") rows = rows.filter((r) => r.status === "Out of stock");
    return rows.sort((a, b) =>
      `${a.locationName}${a.supplyItemName}`.localeCompare(
        `${b.locationName}${b.supplyItemName}`,
        undefined,
        { sensitivity: "base" }
      )
    );
  }, [skus, locations, thresholdsByLocation, locationFilter, categoryFilter, stockStatusFilter]);

  const allCategories = useMemo(
    () =>
      [...new Set(locationOnHandRows.map((r) => r.category).filter(Boolean))].sort(),
    [locationOnHandRows]
  );

  return (
    <div className="reports-page">
      <SectionHeader title="Reports" />

      <section className="report-section">
        <SectionHeader
          compact
          title="Location stock on hand"
          actions={
            locationOnHandRows.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const rows = [
                    [
                      "Location",
                      "Supply item",
                      "Category",
                      "On hand (base)",
                      "Reorder point",
                      "Status",
                    ],
                    ...locationOnHandRows.map((r) => [
                      r.locationName,
                      r.supplyItemName,
                      r.category || "—",
                      r.onHandBase.toFixed(2),
                      r.reorderPoint.toFixed(2),
                      r.status,
                    ]),
                  ];
                  downloadCsv(
                    `location-stock-${new Date().toISOString().slice(0, 10)}.csv`,
                    rows
                  );
                }}
              >
                Export (CSV)
              </Button>
            ) : undefined
          }
        />
        <div className="report-filters">
          <label>
            <span>Location</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="report-filter-select"
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Category</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="report-filter-select"
            >
              <option value="">All categories</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Stock status</span>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
              className="report-filter-select"
            >
              <option value="">All</option>
              <option value="low">Low stock only</option>
              <option value="out">Out of stock only</option>
            </select>
          </label>
        </div>
        {loadingStocks ? (
          <EmptyState title="Loading location stock…" />
        ) : stockError ? (
          <EmptyState title="Couldn't load location stock" body={stockError} error primaryLabel="Retry" onPrimary={loadStocks} />
        ) : (
          <div className="table-wrapper">
            <table className="reports-movements-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Supply item</th>
                  <th>Category</th>
                  <th>On hand (base)</th>
                  <th>Reorder point</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {locationOnHandRows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.locationName}</td>
                    <td>{r.supplyItemName}</td>
                    <td>{r.category || "—"}</td>
                    <td>{r.onHandBase.toFixed(2)}</td>
                    <td>{r.reorderPoint.toFixed(2)}</td>
                    <td>
                      <span
                        className={
                          r.status === "Out of stock"
                            ? "movement-out"
                            : r.status === "Low stock"
                              ? "report-low"
                              : ""
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loadingStocks && !stockError && locationOnHandRows.length === 0 && (
          <EmptyState title="No location stock matches the filters." />
        )}
      </section>

      <section className="report-section">
        <SectionHeader
          compact
          title="Recent stock transactions"
          actions={
            transactions.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const rows = [
                    ["Date", "Type", "Entity", "Item", "Qty delta", "Reference"],
                    ...transactions.map((t) => [
                      formatDate(getTransactionBusinessDate(t)),
                      transactionTypeLabel[t.transactionType] ?? t.transactionType,
                      t.entityType,
                      describeEntity(t),
                      t.quantityDelta,
                      t.referenceType
                        ? `${t.referenceType}:${t.referenceId ?? ""}`
                        : t.reason ?? "—",
                    ]),
                  ];
                  downloadCsv(
                    `stock-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
                    rows
                  );
                }}
              >
                Export (CSV)
              </Button>
            ) : undefined
          }
        />
        <div className="report-filters">
          <label>
            <span>Transaction type</span>
            <select
              value={transactionTypeFilter}
              onChange={(e) => setTransactionTypeFilter(e.target.value)}
              className="report-filter-select"
            >
              {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>From date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="report-filter-input"
            />
          </label>
          <label>
            <span>To date</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="report-filter-input"
            />
          </label>
        </div>
        {loadingTransactions ? (
          <EmptyState title="Loading transactions…" />
        ) : transactionsError ? (
          <EmptyState title="Couldn't load transactions" body={transactionsError} error primaryLabel="Retry" onPrimary={loadTransactions} />
        ) : transactions.length === 0 ? (
          <EmptyState
            title="No transactions found"
          />
        ) : (
          <div className="table-wrapper">
            <table className="reports-movements-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Qty delta</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(getTransactionBusinessDate(t))}</td>
                    <td>{transactionTypeLabel[t.transactionType] ?? t.transactionType}</td>
                    <td>{describeEntity(t)}</td>
                    <td>
                      <span
                        className={
                          Number(t.quantityDelta) >= 0 ? "movement-in" : "movement-out"
                        }
                      >
                        {Number(t.quantityDelta) >= 0 ? "+" : ""}
                        {t.quantityDelta}
                      </span>
                    </td>
                    <td>{t.referenceType ? `${t.referenceType}` : t.reason ?? "—"}</td>
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
