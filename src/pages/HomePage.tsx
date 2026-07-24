import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { propertyStocksApi, skusApi } from "../services/catalogueApi";
import { replenishmentApi } from "../services/replenishmentApi";
import { useInvoices } from "../hooks/useInvoices";
import type { PropertyStock, Sku, UnbilledLine } from "../types";

export const HomePage: React.FC = () => {
  const { invoices } = useInvoices();
  const [propertyStocks, setPropertyStocks] = useState<PropertyStock[]>([]);
  const [unbilledLines, setUnbilledLines] = useState<UnbilledLine[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      propertyStocksApi.getAll(),
      replenishmentApi.listUnbilled(),
      skusApi.getAll(),
    ])
      .then(([stocks, unbilled, allSkus]) => {
        if (cancelled) return;
        setPropertyStocks(stocks);
        setUnbilledLines(unbilled);
        setSkus(allSkus);
      })
      .catch(() => {
        if (cancelled) return;
        setPropertyStocks([]);
        setUnbilledLines([]);
        setSkus([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const lowPropertyStock = propertyStocks.filter(
      (ps) => Number(ps.quantity) <= Number(ps.reorderPoint)
    );

    // Property stock by supply item category (top 5 by quantity)
    const categoryData = propertyStocks.reduce((acc, ps) => {
      const cat = ps.supplyItem?.category?.trim() || "Uncategorized";
      acc[cat] = (acc[cat] || 0) + Number(ps.quantity);
      return acc;
    }, {} as Record<string, number>);
    const categoryChart = Object.entries(categoryData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const hasStockOnHand = skus.some(
      (s) => s.stockOnHand && Number(s.stockOnHand.quantity) > 0
    );

    // Overdue invoices
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueInvoices = invoices
      .filter((invoice) => {
        const dueDate = new Date(invoice.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today && invoice.status !== "paid";
      })
      .map((invoice) => {
        const dueDate = new Date(invoice.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        return { ...invoice, daysOverdue };
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 10);

    const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + inv.total, 0);

    return {
      lowPropertyStockCount: lowPropertyStock.length,
      unbilledCount: unbilledLines.length,
      hasStockOnHand,
      categoryChart,
      overdueInvoices,
      overdueTotal,
      overdueCount: overdueInvoices.length,
    };
  }, [propertyStocks, unbilledLines, skus, invoices]);

  return (
    <div className="home-page">
      <h2>Dashboard</h2>

      {/* Task-oriented stat cards */}
      <div className="stats-grid">
        <div
          className="stat-card warning clickable-stat-card"
          onClick={() => navigate("/properties")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-icon">⚠️</div>
          <div className="stat-content">
            <div className="stat-value">{stats.lowPropertyStockCount}</div>
            <div className="stat-label">Properties Low on Stock</div>
          </div>
        </div>
        <div
          className="stat-card clickable-stat-card"
          onClick={() => navigate("/billing")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-icon">🧾</div>
          <div className="stat-content">
            <div className="stat-value">{stats.unbilledCount}</div>
            <div className="stat-label">Unbilled Lines</div>
          </div>
        </div>
        {!stats.hasStockOnHand && (
          <div
            className="stat-card danger clickable-stat-card"
            onClick={() => navigate("/stock")}
            style={{ cursor: "pointer" }}
          >
            <div className="stat-icon">📦</div>
            <div className="stat-content">
              <div className="stat-value">0</div>
              <div className="stat-label">No Packs On Hand — Receive Stock</div>
            </div>
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        <div className="chart-panel">
          <h3>Property Stock by Category</h3>
          {stats.categoryChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.categoryChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#3b82f6" name="Qty on hand" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">No property stock yet</div>
          )}
        </div>

        <div className="chart-panel">
          <h3>Overdue Invoices</h3>
          {stats.overdueInvoices.length > 0 ? (
            <div className="overdue-invoices-section">
              <div className="overdue-summary">
                <div className="overdue-stat">
                  <span className="overdue-label">Total Overdue:</span>
                  <span className="overdue-amount">${stats.overdueTotal.toFixed(2)}</span>
                </div>
                <div className="overdue-stat">
                  <span className="overdue-label">Count:</span>
                  <span className="overdue-count">{stats.overdueCount}</span>
                </div>
              </div>
              <div className="overdue-invoices-list">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Client</th>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.overdueInvoices.map((invoice) => (
                      <tr key={invoice.id} className="overdue-row">
                        <td>#{invoice.invoiceNumber}</td>
                        <td>{invoice.clientName}</td>
                        <td>
                          {new Date(invoice.dueDate).toLocaleDateString()}
                          <span className="days-overdue"> ({invoice.daysOverdue} days)</span>
                        </td>
                        <td className="amount-cell">${invoice.total.toFixed(2)}</td>
                        <td>
                          <span className="status-badge overdue-badge">
                            {invoice.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">No overdue invoices</div>
          )}
        </div>
      </div>
    </div>
  );
};
