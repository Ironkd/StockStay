import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { useInventory } from "../hooks/useInventory";
import { useInvoices } from "../hooks/useInvoices";

const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981"];

export const HomePage: React.FC = () => {
  const { items } = useInventory();
  const { invoices } = useInvoices();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalStockValue = items.reduce(
      (sum, item) =>
        sum + item.quantity * (item.finalPrice ?? item.priceBoughtFor ?? 0),
      0
    );
    const lowStock = items.filter(
      (item) => item.quantity > 0 && item.quantity <= item.reorderPoint
    ).length;
    const outOfStock = items.filter((item) => item.quantity === 0).length;
    const inStock = totalItems - lowStock - outOfStock;

    // Category distribution
    const categoryData = items.reduce((acc, item) => {
      const cat = item.category || "Uncategorized";
      acc[cat] = (acc[cat] || 0) + item.quantity;
      return acc;
    }, {} as Record<string, number>);

    const categoryChart = Object.entries(categoryData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Location distribution
    const locationData = items.reduce((acc, item) => {
      const loc = item.location || "Unspecified";
      acc[loc] = (acc[loc] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const locationChart = Object.entries(locationData)
      .map(([name, value]) => ({ name, count: value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Low stock items
    const lowStockItems = items
      .filter((item) => item.quantity > 0 && item.quantity <= item.reorderPoint)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 10);

    // Stock status pie chart
    const stockStatusData = [
      { name: "In Stock", value: inStock },
      { name: "Low Stock", value: lowStock },
      { name: "Out of Stock", value: outOfStock }
    ].filter((item) => item.value > 0);

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
      totalItems,
      totalQuantity,
      totalStockValue,
      lowStock,
      outOfStock,
      inStock,
      categoryChart,
      locationChart,
      lowStockItems,
      stockStatusData,
      overdueInvoices,
      overdueTotal,
      overdueCount: overdueInvoices.length
    };
  }, [items, invoices]);

  return (
    <div className="home-page">
      <h2>Dashboard</h2>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalItems}</div>
            <div className="stat-label">Total Items</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalQuantity}</div>
            <div className="stat-label">Total Quantity</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">
              ${stats.totalStockValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="stat-label">Total Stock Value</div>
          </div>
        </div>
        <div 
          className="stat-card warning clickable-stat-card"
          onClick={() => navigate("/inventory?status=low-stock")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-icon">⚠️</div>
          <div className="stat-content">
            <div className="stat-value">{stats.lowStock}</div>
            <div className="stat-label">Low Stock</div>
          </div>
        </div>
        <div 
          className="stat-card danger clickable-stat-card"
          onClick={() => navigate("/inventory?status=out-of-stock")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-icon">🚨</div>
          <div className="stat-content">
            <div className="stat-value">{stats.outOfStock}</div>
            <div className="stat-label">Out of Stock</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        <div className="chart-panel">
          <h3>Stock Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats.stockStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {stats.stockStatusData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-panel">
          <h3>Top Categories by Quantity</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.categoryChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts-row">
        <div className="chart-panel">
          <h3>Items by Location</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.locationChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-panel">
          <h3>Low Stock Items</h3>
          {stats.lowStockItems.length > 0 ? (
            <div className="low-stock-list">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Quantity</th>
                    <th>Reorder Point</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.lowStockItems.map((item) => (
                    <tr key={item.id} className="low-stock-row">
                      <td>{item.name}</td>
                      <td>{item.sku}</td>
                      <td className="quantity-cell">{item.quantity}</td>
                      <td>{item.reorderPoint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No low stock items</div>
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
