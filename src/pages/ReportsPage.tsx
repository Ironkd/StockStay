import React, { useEffect, useState, useMemo } from "react";
import { reportsApi, InventoryMovement, ReportsSummary } from "../services/reportsApi";
import { useInventory } from "../hooks/useInventory";
import { useProperties } from "../hooks/useProperties";
import type { InventoryItem } from "../types";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const movementTypeLabel: Record<string, string> = {
  adjustment: "Adjustment",
  invoice: "Invoice",
  sale: "Sale",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

const MOVEMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "adjustment", label: "Adjustment" },
  { value: "invoice", label: "Invoice" },
  { value: "sale", label: "Sale" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "transfer_out", label: "Transfer out" },
];

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

function getStockStatus(item: InventoryItem): "OK" | "Low stock" | "Out of stock" {
  if (item.quantity <= 0) return "Out of stock";
  if (item.reorderPoint > 0 && item.quantity <= item.reorderPoint) return "Low stock";
  return "OK";
}

const USAGE_PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
];

export const ReportsPage: React.FC = () => {
  const { items } = useInventory();
  const { properties } = useProperties();
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [usageMovements, setUsageMovements] = useState<InventoryMovement[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [productFilter, setProductFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("");

  // Inventory by Property report filters
  const [invByPropProperty, setInvByPropProperty] = useState<string>("");
  const [invByPropCategory, setInvByPropCategory] = useState<string>("");
  const [invByPropLowStock, setInvByPropLowStock] = useState<string>(""); // "", "low", "out"

  // Low stock report filters
  const [lowStockProperty, setLowStockProperty] = useState<string>("");
  const [lowStockCategory, setLowStockCategory] = useState<string>("");

  // Usage report
  const [usagePeriodDays, setUsagePeriodDays] = useState<string>("30");
  const [usageView, setUsageView] = useState<"property" | "item" | "time">("item");

  useEffect(() => {
    reportsApi.getSummary().then(setSummary).catch(() => setSummary(null)).finally(() => setLoadingSummary(false));
  }, []);

  useEffect(() => {
    setLoadingMovements(true);
    const params: { inventoryItemId?: string; fromDate?: string; toDate?: string; movementType?: string } = {};
    if (productFilter) params.inventoryItemId = productFilter;
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;
    if (movementTypeFilter) params.movementType = movementTypeFilter;
    reportsApi
      .getMovements(params)
      .then(setMovements)
      .catch(() => setMovements([]))
      .finally(() => setLoadingMovements(false));
  }, [productFilter, fromDate, toDate, movementTypeFilter]);

  // Fetch movements for usage report (last N days)
  useEffect(() => {
    setLoadingUsage(true);
    const days = Math.min(365, Math.max(1, parseInt(usagePeriodDays, 10) || 30));
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    reportsApi
      .getMovements({ fromDate: fromStr, toDate: toStr, limit: 2000 })
      .then(setUsageMovements)
      .catch(() => setUsageMovements([]))
      .finally(() => setLoadingUsage(false));
  }, [usagePeriodDays]);

  const getPropertyName = (propertyId: string | undefined) =>
    propertyId ? properties.find((p) => p.id === propertyId)?.name ?? "—" : "—";

  // Inventory by Property: filtered rows
  const inventoryByPropertyRows = useMemo(() => {
    let rows = items.map((item) => ({
      ...item,
      propertyName: getPropertyName(item.propertyId),
      status: getStockStatus(item),
    }));
    if (invByPropProperty) rows = rows.filter((r) => r.propertyId === invByPropProperty);
    if (invByPropCategory) rows = rows.filter((r) => (r.category || "").trim() === invByPropCategory);
    if (invByPropLowStock === "low") rows = rows.filter((r) => r.status === "Low stock");
    if (invByPropLowStock === "out") rows = rows.filter((r) => r.status === "Out of stock");
    return rows;
  }, [items, properties, invByPropProperty, invByPropCategory, invByPropLowStock]);

  const allCategories = useMemo(
    () => [...new Set(items.map((i) => (i.category || "").trim()).filter(Boolean))].sort(),
    [items]
  );

  // Low stock and reorder: items at or below reorder point
  const lowStockRows = useMemo(() => {
    let rows = items
      .filter((i) => i.quantity <= (i.reorderPoint || 0) || i.quantity === 0)
      .map((item) => ({
        ...item,
        propertyName: getPropertyName(item.propertyId),
        status: getStockStatus(item),
      }));
    if (lowStockProperty) rows = rows.filter((r) => r.propertyId === lowStockProperty);
    if (lowStockCategory) rows = rows.filter((r) => (r.category || "").trim() === lowStockCategory);
    return rows;
  }, [items, properties, lowStockProperty, lowStockCategory]);

  // Inventory value: per property, per category, overall
  const valueByProperty = useMemo(() => {
    const map = new Map<string, { cost: number; retail: number }>();
    for (const item of items) {
      const key = item.propertyId || "_unassigned";
      const curr = map.get(key) || { cost: 0, retail: 0 };
      curr.cost += item.quantity * item.priceBoughtFor;
      curr.retail += item.quantity * item.finalPrice;
      map.set(key, curr);
    }
    return map;
  }, [items]);

  const valueByCategory = useMemo(() => {
    const map = new Map<string, { cost: number; retail: number }>();
    for (const item of items) {
      const key = (item.category || "").trim() || "Uncategorized";
      const curr = map.get(key) || { cost: 0, retail: 0 };
      curr.cost += item.quantity * item.priceBoughtFor;
      curr.retail += item.quantity * item.finalPrice;
      map.set(key, curr);
    }
    return map;
  }, [items]);

  const totalPortfolioValue = useMemo(() => {
    let cost = 0, retail = 0;
    for (const item of items) {
      cost += item.quantity * item.priceBoughtFor;
      retail += item.quantity * item.finalPrice;
    }
    return { cost, retail };
  }, [items]);

  // Usage (outbound movements): by item, by property, over time
  const usageByItem = useMemo(() => {
    const out = usageMovements.filter((m) => m.quantityDelta < 0);
    const map = new Map<string, { qty: number; unit: string }>();
    for (const m of out) {
      const key = m.inventoryItemId;
      const curr = map.get(key) || { qty: 0, unit: m.unit || "" };
      curr.qty += Math.abs(m.quantityDelta);
      map.set(key, curr);
    }
    return map;
  }, [usageMovements]);

  const usageByProperty = useMemo(() => {
    const out = usageMovements.filter((m) => m.quantityDelta < 0);
    const map = new Map<string, number>();
    for (const m of out) {
      const item = items.find((i) => i.id === m.inventoryItemId);
      const propId = item?.propertyId || "_unassigned";
      map.set(propId, (map.get(propId) || 0) + Math.abs(m.quantityDelta));
    }
    return map;
  }, [usageMovements, items]);

  const usageOverTime = useMemo(() => {
    const out = usageMovements.filter((m) => m.quantityDelta < 0);
    const byDay = new Map<string, number>();
    for (const m of out) {
      const day = m.createdAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + Math.abs(m.quantityDelta));
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [usageMovements]);

  return (
    <div className="reports-page">
      <h1 className="page-title">Reports</h1>

      {/* Summary */}
      <section className="report-section">
        <div className="report-section-header">
          <h2>Report summary</h2>
          {summary && (
            <button
              type="button"
              className="secondary export-report-btn"
              onClick={() => {
                const rows = [
                  ["Metric", "Value"],
                  ["Total products", summary.totalItems],
                  ["Low stock", summary.lowStockCount],
                  ["Out of stock", summary.outOfStockCount],
                  ["Total cost value", `$${summary.totalCostValue.toFixed(2)}`],
                  ["Total retail value", `$${summary.totalRetailValue.toFixed(2)}`],
                ];
                downloadCsv(`report-summary-${new Date().toISOString().slice(0, 10)}.csv`, rows);
              }}
            >
              Export summary (CSV)
            </button>
          )}
        </div>
        {loadingSummary ? (
          <p>Loading summary…</p>
        ) : summary ? (
          <div className="report-summary-cards">
            <div className="report-card">
              <span className="report-card-label">Total products</span>
              <span className="report-card-value">{summary.totalItems}</span>
            </div>
            <div className="report-card">
              <span className="report-card-label">Low stock</span>
              <span className="report-card-value warning">{summary.lowStockCount}</span>
            </div>
            <div className="report-card">
              <span className="report-card-label">Out of stock</span>
              <span className="report-card-value danger">{summary.outOfStockCount}</span>
            </div>
            <div className="report-card">
              <span className="report-card-label">Total cost value</span>
              <span className="report-card-value">${summary.totalCostValue.toFixed(2)}</span>
            </div>
            <div className="report-card">
              <span className="report-card-label">Total retail value</span>
              <span className="report-card-value">${summary.totalRetailValue.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <p>Could not load summary.</p>
        )}
      </section>

      {/* Inventory by Property */}
      <section className="report-section">
        <div className="report-section-header">
          <h2>Inventory by Property</h2>
          {inventoryByPropertyRows.length > 0 && (
            <button
              type="button"
              className="secondary export-report-btn"
              onClick={() => {
                const rows = [
                  ["Item name", "Category", "Property", "Quantity on hand", "Low stock status", "Last updated"],
                  ...inventoryByPropertyRows.map((r) => [
                    r.name,
                    r.category || "—",
                    r.propertyName,
                    String(r.quantity),
                    r.status,
                    formatDate(r.updatedAt),
                  ]),
                ];
                downloadCsv(`inventory-by-property-${new Date().toISOString().slice(0, 10)}.csv`, rows);
              }}
            >
              Export (CSV)
            </button>
          )}
        </div>
        <p className="report-description">
          All items with property, quantity, and stock status. Filter by property, category, or low stock.
        </p>
        <div className="report-filters">
          <label>
            <span>Property</span>
            <select
              value={invByPropProperty}
              onChange={(e) => setInvByPropProperty(e.target.value)}
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
              value={invByPropCategory}
              onChange={(e) => setInvByPropCategory(e.target.value)}
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
              value={invByPropLowStock}
              onChange={(e) => setInvByPropLowStock(e.target.value)}
              className="report-filter-select"
            >
              <option value="">All</option>
              <option value="low">Low stock only</option>
              <option value="out">Out of stock only</option>
            </select>
          </label>
        </div>
        <div className="table-wrapper">
          <table className="reports-movements-table">
            <thead>
              <tr>
                <th>Item name</th>
                <th>Category</th>
                <th>Property</th>
                <th>Quantity on hand</th>
                <th>Low stock status</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {inventoryByPropertyRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.category || "—"}</td>
                  <td>{r.propertyName}</td>
                  <td>{r.quantity} {r.unit}</td>
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
        {inventoryByPropertyRows.length === 0 && <p className="report-empty">No items match the filters.</p>}
      </section>

      {/* Low stock and reorder */}
      <section className="report-section">
        <div className="report-section-header">
          <h2>Low stock and reorder</h2>
          {lowStockRows.length > 0 && (
            <button
              type="button"
              className="secondary export-report-btn"
              onClick={() => {
                const rows = [
                  ["Item name", "Category", "Property", "Qty on hand", "Reorder point", "Reorder qty", "Status", "Last updated"],
                  ...lowStockRows.map((r) => [
                    r.name,
                    r.category || "—",
                    r.propertyName,
                    String(r.quantity),
                    String(r.reorderPoint),
                    String(r.reorderQuantity ?? "—"),
                    r.status,
                    formatDate(r.updatedAt),
                  ]),
                ];
                downloadCsv(`low-stock-reorder-${new Date().toISOString().slice(0, 10)}.csv`, rows);
              }}
            >
              Export (CSV)
            </button>
          )}
        </div>
        <p className="report-description">
          Items at or below reorder point or out of stock. Use this to reorder.
        </p>
        <div className="report-filters">
          <label>
            <span>Property</span>
            <select
              value={lowStockProperty}
              onChange={(e) => setLowStockProperty(e.target.value)}
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
              value={lowStockCategory}
              onChange={(e) => setLowStockCategory(e.target.value)}
              className="report-filter-select"
            >
              <option value="">All categories</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrapper">
          <table className="reports-movements-table">
            <thead>
              <tr>
                <th>Item name</th>
                <th>Category</th>
                <th>Property</th>
                <th>Qty on hand</th>
                <th>Reorder point</th>
                <th>Reorder qty</th>
                <th>Status</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {lowStockRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.category || "—"}</td>
                  <td>{r.propertyName}</td>
                  <td>{r.quantity} {r.unit}</td>
                  <td>{r.reorderPoint}</td>
                  <td>{r.reorderQuantity ?? "—"}</td>
                  <td>
                    <span className={r.status === "Out of stock" ? "movement-out" : "report-low"}>{r.status}</span>
                  </td>
                  <td>{formatDate(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lowStockRows.length === 0 && <p className="report-empty">No low stock or out-of-stock items.</p>}
      </section>

      {/* Inventory value */}
      <section className="report-section">
        <div className="report-section-header">
          <h2>Inventory value</h2>
          <button
            type="button"
            className="secondary export-report-btn"
            onClick={() => {
              const rows = [
                ["Type", "Name", "Cost value", "Retail value"],
                ...Array.from(valueByProperty.entries()).map(([propId, v]) => [
                  "Property",
                  propId === "_unassigned" ? "Unassigned" : (properties.find((p) => p.id === propId)?.name ?? propId),
                  `$${v.cost.toFixed(2)}`,
                  `$${v.retail.toFixed(2)}`,
                ]),
                ...Array.from(valueByCategory.entries()).map(([cat, v]) => [
                  "Category",
                  cat,
                  `$${v.cost.toFixed(2)}`,
                  `$${v.retail.toFixed(2)}`,
                ]),
                ["Portfolio", "Overall", `$${totalPortfolioValue.cost.toFixed(2)}`, `$${totalPortfolioValue.retail.toFixed(2)}`],
              ];
              downloadCsv(`inventory-value-${new Date().toISOString().slice(0, 10)}.csv`, rows);
            }}
          >
            Export (CSV)
          </button>
        </div>
        <p className="report-description">
          Total inventory value (cost and retail) per property, per category, and overall portfolio.
        </p>
        <div className="report-value-tables">
          <div className="report-value-block">
            <h3 className="report-value-title">By property</h3>
            <table className="reports-movements-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Cost value</th>
                  <th>Retail value</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(valueByProperty.entries()).map(([propId, v]) => (
                  <tr key={propId}>
                    <td>{propId === "_unassigned" ? "Unassigned" : (properties.find((p) => p.id === propId)?.name ?? propId)}</td>
                    <td>${v.cost.toFixed(2)}</td>
                    <td>${v.retail.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="report-value-block">
            <h3 className="report-value-title">By category</h3>
            <table className="reports-movements-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Cost value</th>
                  <th>Retail value</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(valueByCategory.entries()).map(([cat, v]) => (
                  <tr key={cat}>
                    <td>{cat}</td>
                    <td>${v.cost.toFixed(2)}</td>
                    <td>${v.retail.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="report-portfolio-total">
          <strong>Overall portfolio</strong> — Cost: ${totalPortfolioValue.cost.toFixed(2)} | Retail: ${totalPortfolioValue.retail.toFixed(2)}
        </div>
      </section>

      {/* Usage and consumption */}
      <section className="report-section">
        <div className="report-section-header">
          <h2>Usage and consumption</h2>
          {!loadingUsage && (usageByItem.size > 0 || usageOverTime.length > 0) && (
            <button
              type="button"
              className="secondary export-report-btn"
              onClick={() => {
                if (usageView === "item") {
                  const rows = [
                    ["Item", "Property", "Quantity used"],
                    ...items
                      .filter((i) => usageByItem.has(i.id))
                      .map((i) => [
                        i.name,
                        getPropertyName(i.propertyId),
                        String(usageByItem.get(i.id)?.qty ?? 0),
                      ]),
                  ];
                  downloadCsv(`usage-by-item-${new Date().toISOString().slice(0, 10)}.csv`, rows);
                } else if (usageView === "property") {
                  const rows = [
                    ["Property", "Quantity used"],
                    ...Array.from(usageByProperty.entries()).map(([propId, qty]) => [
                      propId === "_unassigned" ? "Unassigned" : (properties.find((p) => p.id === propId)?.name ?? propId),
                      String(qty),
                    ]),
                  ];
                  downloadCsv(`usage-by-property-${new Date().toISOString().slice(0, 10)}.csv`, rows);
                } else {
                  const rows = [["Date", "Quantity used"], ...usageOverTime.map(([day, qty]) => [day, String(qty)])];
                  downloadCsv(`usage-over-time-${new Date().toISOString().slice(0, 10)}.csv`, rows);
                }
              }}
            >
              Export (CSV)
            </button>
          )}
        </div>
        <p className="report-description">
          Quantity taken out (invoices, sales, transfers out) in the selected period. View by property, by item, or over time.
        </p>
        <div className="report-filters">
          <label>
            <span>Period</span>
            <select
              value={usagePeriodDays}
              onChange={(e) => setUsagePeriodDays(e.target.value)}
              className="report-filter-select"
            >
              {USAGE_PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>View</span>
            <select
              value={usageView}
              onChange={(e) => setUsageView(e.target.value as "property" | "item" | "time")}
              className="report-filter-select"
            >
              <option value="item">By item</option>
              <option value="property">By property</option>
              <option value="time">Over time</option>
            </select>
          </label>
        </div>
        {loadingUsage ? (
          <p>Loading usage…</p>
        ) : usageView === "item" ? (
          <div className="table-wrapper">
            <table className="reports-movements-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Property</th>
                  <th>Quantity used</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((i) => usageByItem.has(i.id))
                  .map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>{getPropertyName(i.propertyId)}</td>
                      <td>{usageByItem.get(i.id)?.qty ?? 0} {usageByItem.get(i.id)?.unit || i.unit}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : usageView === "property" ? (
          <div className="table-wrapper">
            <table className="reports-movements-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Quantity used</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(usageByProperty.entries()).map(([propId, qty]) => (
                  <tr key={propId}>
                    <td>{propId === "_unassigned" ? "Unassigned" : (properties.find((p) => p.id === propId)?.name ?? propId)}</td>
                    <td>{qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="reports-movements-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Quantity used</th>
                </tr>
              </thead>
              <tbody>
                {usageOverTime.map(([day, qty]) => (
                  <tr key={day}>
                    <td>{day}</td>
                    <td>{qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loadingUsage && usageByItem.size === 0 && usageOverTime.length === 0 && (
          <p className="report-empty">No usage in the selected period.</p>
        )}
      </section>

      {/* Product ins & outs */}
      <section className="report-section">
        <div className="report-section-header">
          <h2>Product ins & outs</h2>
          {movements.length > 0 && (
            <button
              type="button"
              className="secondary export-report-btn"
              onClick={() => {
                const rows = [
                  ["Product", "Date", "Type", "In/Out", "Quantity", "Reference"],
                  ...movements.map((m) => [
                    m.itemName ?? "—",
                    formatDate(m.createdAt),
                    movementTypeLabel[m.movementType] ?? m.movementType,
                    m.quantityDelta >= 0 ? "In" : "Out",
                    `${m.quantityDelta >= 0 ? "+" : ""}${m.quantityDelta} ${m.unit || ""}`.trim(),
                    m.referenceLabel ?? "—",
                  ]),
                ];
                downloadCsv(`report-movements-${new Date().toISOString().slice(0, 10)}.csv`, rows);
              }}
            >
              Export movements (CSV)
            </button>
          )}
        </div>
        <p className="report-description">
          Movement history for each product: quantity added (in) or removed (out) with date and reference.
        </p>
        <div className="report-filters">
          <label>
            <span>Product</span>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="report-filter-select"
            >
              <option value="">All products</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} {item.sku ? `(${item.sku})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Movement type</span>
            <select
              value={movementTypeFilter}
              onChange={(e) => setMovementTypeFilter(e.target.value)}
              className="report-filter-select"
            >
              {MOVEMENT_TYPE_OPTIONS.map((opt) => (
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
        {loadingMovements ? (
          <p>Loading movements…</p>
        ) : movements.length === 0 ? (
          <p className="report-empty">No movements found. Add or subtract quantity on inventory items, create invoices, or transfer stock to see history.</p>
        ) : (
          <div className="table-wrapper">
            <table className="reports-movements-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>In / Out</th>
                  <th>Quantity</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{m.itemName ?? "—"}</td>
                    <td>{formatDate(m.createdAt)}</td>
                    <td>{movementTypeLabel[m.movementType] ?? m.movementType}</td>
                    <td>
                      <span className={m.quantityDelta >= 0 ? "movement-in" : "movement-out"}>
                        {m.quantityDelta >= 0 ? "In" : "Out"}
                      </span>
                    </td>
                    <td>
                      {m.quantityDelta >= 0 ? "+" : ""}
                      {m.quantityDelta} {m.unit || ""}
                    </td>
                    <td>{m.referenceLabel ?? "—"}</td>
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
