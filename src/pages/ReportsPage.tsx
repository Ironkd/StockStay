import React, { useEffect, useState } from "react";
import { reportsApi, InventoryMovement, ReportsSummary } from "../services/reportsApi";
import { useInventory } from "../hooks/useInventory";

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

export const ReportsPage: React.FC = () => {
  const { items } = useInventory();
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [productFilter, setProductFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    reportsApi.getSummary().then(setSummary).catch(() => setSummary(null)).finally(() => setLoadingSummary(false));
  }, []);

  useEffect(() => {
    setLoadingMovements(true);
    const params: { inventoryItemId?: string; fromDate?: string; toDate?: string } = {};
    if (productFilter) params.inventoryItemId = productFilter;
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;
    reportsApi
      .getMovements(params)
      .then(setMovements)
      .catch(() => setMovements([]))
      .finally(() => setLoadingMovements(false));
  }, [productFilter, fromDate, toDate]);

  return (
    <div className="reports-page">
      <h1 className="page-title">Reports</h1>

      {/* Summary */}
      <section className="report-section">
        <h2>Report summary</h2>
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

      {/* Product ins & outs */}
      <section className="report-section">
        <h2>Product ins & outs</h2>
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
