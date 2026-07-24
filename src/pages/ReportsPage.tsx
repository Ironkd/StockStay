import React, { useEffect, useMemo, useState } from "react";
import { propertyStocksApi, skusApi, stockTransactionsApi } from "../services/catalogueApi";
import { propertiesApi } from "../services/propertiesApi";
import type { PropertyStock, Sku, StockTransaction, Property } from "../types";

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

function getStockStatus(row: PropertyStock): "OK" | "Low stock" | "Out of stock" {
  const quantity = Number(row.quantity);
  const reorderPoint = Number(row.reorderPoint);
  if (quantity <= 0) return "Out of stock";
  if (reorderPoint > 0 && quantity <= reorderPoint) return "Low stock";
  return "OK";
}

export const ReportsPage: React.FC = () => {
  const [propertyStocks, setPropertyStocks] = useState<PropertyStock[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  const [propertyFilter, setPropertyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState(""); // "", "low", "out"

  const [transactionTypeFilter, setTransactionTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    Promise.all([propertyStocksApi.getAll(), propertiesApi.getAll(), skusApi.getAll()])
      .then(([stocks, props, allSkus]) => {
        setPropertyStocks(stocks);
        setProperties(props);
        setSkus(allSkus);
      })
      .catch(() => {
        setPropertyStocks([]);
        setProperties([]);
        setSkus([]);
      })
      .finally(() => setLoadingStocks(false));
  }, []);

  useEffect(() => {
    setLoadingTransactions(true);
    stockTransactionsApi
      .getAll({
        transactionType: transactionTypeFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 500,
      })
      .then(setTransactions)
      .catch(() => setTransactions([]))
      .finally(() => setLoadingTransactions(false));
  }, [transactionTypeFilter, fromDate, toDate]);

  // Lookup maps for resolving transaction entityId -> a readable label
  const propertyStockById = useMemo(() => {
    const map = new Map<string, PropertyStock>();
    for (const ps of propertyStocks) map.set(ps.id, ps);
    return map;
  }, [propertyStocks]);

  const skuByStockOnHandId = useMemo(() => {
    const map = new Map<string, Sku>();
    for (const sku of skus) {
      if (sku.stockOnHand) map.set(sku.stockOnHand.id, sku);
    }
    return map;
  }, [skus]);

  const describeEntity = (row: StockTransaction): string => {
    if (row.entityType === "property_stock") {
      const ps = propertyStockById.get(row.entityId);
      if (ps) return `${ps.supplyItem?.name || "Item"} @ ${ps.property?.name || "Property"}`;
      return "Property stock";
    }
    const sku = skuByStockOnHandId.get(row.entityId);
    if (sku) return `${sku.name} @ ${sku.stockLocation?.name || "Location"}`;
    return "Stock on hand";
  };

  const allCategories = useMemo(
    () =>
      [...new Set(propertyStocks.map((ps) => (ps.supplyItem?.category || "").trim()).filter(Boolean))].sort(),
    [propertyStocks]
  );

  const propertyStockRows = useMemo(() => {
    let rows = propertyStocks.map((ps) => ({
      ...ps,
      status: getStockStatus(ps),
    }));
    if (propertyFilter) rows = rows.filter((r) => r.propertyId === propertyFilter);
    if (categoryFilter) rows = rows.filter((r) => (r.supplyItem?.category || "").trim() === categoryFilter);
    if (stockStatusFilter === "low") rows = rows.filter((r) => r.status === "Low stock");
    if (stockStatusFilter === "out") rows = rows.filter((r) => r.status === "Out of stock");
    return rows;
  }, [propertyStocks, propertyFilter, categoryFilter, stockStatusFilter]);

  return (
    <div className="reports-page">
      <h1 className="page-title">Reports</h1>

      {/* Property stock on hand */}
      <section className="report-section">
        <div className="report-section-header">
          <h2>Property stock on hand</h2>
          {propertyStockRows.length > 0 && (
            <button
              type="button"
              className="secondary export-report-btn"
              onClick={() => {
                const rows = [
                  ["Property", "Supply item", "Category", "Quantity", "Reorder point", "Reorder qty", "Status", "Last updated"],
                  ...propertyStockRows.map((r) => [
                    r.property?.name || "—",
                    r.supplyItem?.name || "—",
                    r.supplyItem?.category || "—",
                    r.quantity,
                    r.reorderPoint,
                    r.reorderQuantity,
                    r.status,
                    formatDate(r.updatedAt),
                  ]),
                ];
                downloadCsv(`property-stock-${new Date().toISOString().slice(0, 10)}.csv`, rows);
              }}
            >
              Export (CSV)
            </button>
          )}
        </div>
        <p className="report-description">
          Current property stock quantities. Filter by property, category, or stock status.
        </p>
        <div className="report-filters">
          <label>
            <span>Property</span>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="report-filter-select"
            >
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
                <option key={c} value={c}>{c}</option>
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
          <p>Loading property stock…</p>
        ) : (
          <div className="table-wrapper">
            <table className="reports-movements-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Supply item</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Reorder point</th>
                  <th>Status</th>
                  <th>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {propertyStockRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.property?.name || "—"}</td>
                    <td>{r.supplyItem?.name || "—"}</td>
                    <td>{r.supplyItem?.category || "—"}</td>
                    <td>{Number(r.quantity).toFixed(2)}</td>
                    <td>{Number(r.reorderPoint).toFixed(2)}</td>
                    <td>
                      <span className={r.status === "Out of stock" ? "movement-out" : r.status === "Low stock" ? "report-low" : ""}>
                        {r.status}
                      </span>
                    </td>
                    <td>{formatDate(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loadingStocks && propertyStockRows.length === 0 && (
          <p className="report-empty">No property stock matches the filters.</p>
        )}
      </section>

      {/* Recent stock transactions */}
      <section className="report-section">
        <div className="report-section-header">
          <h2>Recent stock transactions</h2>
          {transactions.length > 0 && (
            <button
              type="button"
              className="secondary export-report-btn"
              onClick={() => {
                const rows = [
                  ["Date", "Type", "Entity", "Item", "Qty delta", "Reference"],
                  ...transactions.map((t) => [
                    formatDate(t.createdAt),
                    transactionTypeLabel[t.transactionType] ?? t.transactionType,
                    t.entityType,
                    describeEntity(t),
                    t.quantityDelta,
                    t.referenceType ? `${t.referenceType}:${t.referenceId ?? ""}` : (t.reason ?? "—"),
                  ]),
                ];
                downloadCsv(`stock-transactions-${new Date().toISOString().slice(0, 10)}.csv`, rows);
              }}
            >
              Export (CSV)
            </button>
          )}
        </div>
        <p className="report-description">
          Ledger of stock movements: receipts, adjustments, and replenishment in/out.
        </p>
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
          <p>Loading transactions…</p>
        ) : transactions.length === 0 ? (
          <p className="report-empty">No transactions found. Receive stock, replenish properties, or adjust quantities to see history.</p>
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
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{transactionTypeLabel[t.transactionType] ?? t.transactionType}</td>
                    <td>{describeEntity(t)}</td>
                    <td>
                      <span className={Number(t.quantityDelta) >= 0 ? "movement-in" : "movement-out"}>
                        {Number(t.quantityDelta) >= 0 ? "+" : ""}
                        {t.quantityDelta}
                      </span>
                    </td>
                    <td>{t.referenceType ? `${t.referenceType}` : (t.reason ?? "—")}</td>
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
