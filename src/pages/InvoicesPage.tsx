import React, { useState, useMemo, useEffect } from "react";
import { useInvoices } from "../hooks/useInvoices";
import { useClients } from "../hooks/useClients";
import { useSales } from "../hooks/useSales";
import { useInventory } from "../hooks/useInventory";
import { useWarehouses } from "../hooks/useWarehouses";
import { Invoice, InvoiceItem } from "../types";

export const InvoicesPage: React.FC = () => {
  const { invoices, addInvoice, updateInvoice, removeInvoice, refresh: refreshInvoices } = useInvoices();
  const { clients } = useClients();
  const { sales, refresh: refreshSales } = useSales();
   // Inventory & warehouses for picking items into invoices
  const { items: inventoryItems, refresh: refreshInventory } = useInventory();
  const { getWarehouseById } = useWarehouses();
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showForm, setShowForm] = useState(false);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  
  // Section visibility state
  const [sectionVisibility, setSectionVisibility] = useState({
    soldByMonth: true,
    activeInvoices: true,
    sentInvoices: true
  });

  const toggleSection = (section: keyof typeof sectionVisibility) => {
    setSectionVisibility(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Refresh invoices when sales change (to pick up auto-generated invoices)
  useEffect(() => {
    refreshInvoices();
  }, [sales.length]);

  // Refetch when tab becomes visible or when a sale creates an invoice (so invoice shows immediately)
  useEffect(() => {
    const onRefresh = () => refreshInvoices();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onRefresh();
    };
    window.addEventListener("invoices-refresh", onRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("invoices-refresh", onRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshInvoices]);

  const [formData, setFormData] = useState({
    invoiceNumber: "",
    clientId: "",
    date: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    items: [] as InvoiceItem[],
    tax: 0,
    status: "draft" as Invoice["status"],
    notes: ""
  });

  const [currentItem, setCurrentItem] = useState({
    inventoryItemId: "",
    quantity: 1
  });

  const resetForm = () => {
    setFormData({
      invoiceNumber: "",
      clientId: "",
      date: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      items: [],
      tax: 0,
      status: "draft",
      notes: ""
    });
    setCurrentItem({ inventoryItemId: "", quantity: 1 });
    setEditingInvoice(null);
    setShowForm(false);
  };

  // Inventory helpers for picking items into the invoice
  const selectedInventoryItem = useMemo(() => {
    return inventoryItems.find((item) => item.id === currentItem.inventoryItemId);
  }, [inventoryItems, currentItem.inventoryItemId]);

  const availableInventoryItems = useMemo(() => {
    return inventoryItems.filter((item) => item.quantity > 0);
  }, [inventoryItems]);

  const addItemToInvoice = () => {
    if (!currentItem.inventoryItemId || currentItem.quantity <= 0) {
      alert("Please select an item from the warehouse and enter a quantity");
      return;
    }

    const inventoryItem = selectedInventoryItem;
    if (!inventoryItem) {
      alert("Selected inventory item not found");
      return;
    }

    if (currentItem.quantity > inventoryItem.quantity) {
      alert(
        `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${currentItem.quantity}`
      );
      return;
    }

    // Check if item already exists on the invoice; if so, accumulate quantity
    const existingIndex = formData.items.findIndex(
      (item) => item.inventoryItemId === inventoryItem.id
    );

    if (existingIndex >= 0) {
      const updatedItems = [...formData.items];
      const existing = updatedItems[existingIndex];
      const newQuantity = existing.quantity + currentItem.quantity;
      updatedItems[existingIndex] = {
        ...existing,
        quantity: newQuantity,
        total: newQuantity * existing.unitPrice
      };
      setFormData({ ...formData, items: updatedItems });
    } else {
      const newItem: InvoiceItem = {
        id: crypto.randomUUID(),
        name: inventoryItem.name,
        quantity: currentItem.quantity,
        unitPrice: inventoryItem.finalPrice,
        total: currentItem.quantity * inventoryItem.finalPrice,
        inventoryItemId: inventoryItem.id,
        sku: inventoryItem.sku
      };
      setFormData({
        ...formData,
        items: [...formData.items, newItem]
      });
    }

    setCurrentItem({ inventoryItemId: "", quantity: 1 });
  };

  const removeItemFromInvoice = (itemId: string) => {
    setFormData({
      ...formData,
      items: formData.items.filter((item) => item.id !== itemId)
    });
  };

  const calculations = useMemo(() => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = (subtotal * formData.tax) / 100;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  }, [formData.items, formData.tax]);

  // Generate years (current year ± 5 years)
  const years = useMemo(() => {
    const currentYear = now.getFullYear();
    const yearList = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
      yearList.push(i);
    }
    return yearList;
  }, []);

  // Month names
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const soldByMonth = useMemo(() => {
    const inMonth = (d: string) => {
      const dt = new Date(d);
      return dt.getFullYear() === selectedYear && dt.getMonth() + 1 === selectedMonth;
    };
    const invs = invoices.filter((inv) => inMonth(inv.date));
    const byClient = new Map<string, { clientName: string; invoices: Invoice[] }>();
    for (const inv of invs) {
      const existing = byClient.get(inv.clientId);
      if (existing) existing.invoices.push(inv);
      else byClient.set(inv.clientId, { clientName: inv.clientName, invoices: [inv] });
    }
    return Array.from(byClient.entries()).map(([clientId, data]) => ({
      clientId,
      clientName: data.clientName,
      invoices: data.invoices
    }));
  }, [invoices, selectedYear, selectedMonth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.invoiceNumber || !formData.clientId) {
      alert("Invoice number and client are required");
      return;
    }

    const selectedClient = clients.find((c) => c.id === formData.clientId);
    if (!selectedClient) {
      alert("Please select a valid client");
      return;
    }

    const invoiceData = {
      ...formData,
      clientName: selectedClient.name,
      subtotal: calculations.subtotal,
      total: calculations.total
    };

    // Remember if this invoice had already been sent before editing.
    const wasPreviouslySent = editingInvoice?.status === "sent";

    try {
      if (editingInvoice) {
        await updateInvoice(editingInvoice.id, invoiceData);
      } else {
        await addInvoice(invoiceData);
      }

      // Refresh invoices and inventory so stock levels and UI stay in sync
      await refreshInvoices();
      await refreshInventory();

      // If this invoice was already sent, treat saving edits as sending an updated version.
      if (wasPreviouslySent && editingInvoice) {
        alert(
          `An updated invoice for ${editingInvoice.clientName} has been sent with the latest changes.`
        );
      }

      resetForm();
    } catch (error) {
      console.error("Error saving invoice:", error);
      alert("There was a problem saving this invoice. Please try again.");
    }
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      date: invoice.date,
      dueDate: invoice.dueDate,
      items: invoice.items,
      tax: (invoice.tax / invoice.subtotal) * 100 || 0,
      status: invoice.status,
      notes: invoice.notes || ""
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this invoice?")) {
      removeInvoice(id);
    }
  };

  const handleSend = async (invoice: Invoice) => {
    try {
      // Mark the invoice as sent. In a real setup this is
      // where you would also trigger an email to the client.
      await updateInvoice(invoice.id, { status: "sent" });
      alert(`Invoice #${invoice.invoiceNumber} marked as sent to ${invoice.clientName}.`);
    } catch (error) {
      console.error("Error sending invoice", error);
      alert("There was a problem sending this invoice. Please try again.");
    }
  };

  const getStatusColor = (status: Invoice["status"]) => {
    switch (status) {
      case "paid":
        return "#10b981";
      case "sent":
        return "#3b82f6";
      case "overdue":
        return "#ef4444";
      default:
        return "#64748b";
    }
  };

  const isAutoGenerated = (invoice: Invoice) => {
    return invoice.notes === "Auto-generated from sales";
  };

  const getInvoiceTitle = (invoice: Invoice) => {
    // Show the month and year the invoice date falls in, e.g. "January 2026"
    const d = new Date(invoice.date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  // Separate active invoices (not sent) from sent invoices (archived)
  const { activeInvoices, sentInvoices } = useMemo(() => {
    const active = invoices.filter(inv => inv.status !== "sent");
    const sent = invoices.filter(inv => inv.status === "sent").sort((a, b) => {
      // Sort by date, most recent first
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    return { activeInvoices: active, sentInvoices: sent };
  }, [invoices]);

  // Render invoice card component
  const renderInvoiceCard = (invoice: Invoice) => {
    const isAuto = isAutoGenerated(invoice);
    return (
      <div key={invoice.id} className="invoice-card">
        <div className="invoice-header">
          <div>
            <h4>
              {getInvoiceTitle(invoice)}
              {isAuto && (
                <span
                  style={{
                    marginLeft: "8px",
                    fontSize: "0.75em",
                    color: "#3b82f6",
                    fontWeight: "normal"
                  }}
                >
                  (Auto-generated)
                </span>
              )}
            </h4>
            <p>{invoice.clientName}</p>
          </div>
          <div className="invoice-meta">
            <span
              className="status-badge"
              style={{ backgroundColor: getStatusColor(invoice.status) }}
            >
              {invoice.status.toUpperCase()}
            </span>
            <div className="invoice-actions">
              {invoice.status !== "sent" && (
                <button
                  onClick={() => handleSend(invoice)}
                  title="Send to client"
                  disabled={invoice.status === "paid"}
                  style={{
                    backgroundColor: invoice.status === "paid" ? "#94a3b8" : "#3b82f6",
                    color: "white",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    cursor: invoice.status === "paid" ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    marginRight: "8px"
                  }}
                >
                  Send
                </button>
              )}
              <button
                className="icon-button"
                onClick={() => handleEdit(invoice)}
                title="Edit"
              >
                ✏️
              </button>
              <button
                className="icon-button"
                onClick={() => handleDelete(invoice.id)}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
        <div className="invoice-details">
          <p>
            <strong>Date:</strong> {new Date(invoice.date).toLocaleDateString()}
          </p>
          <p>
            <strong>Due Date:</strong>{" "}
            {new Date(invoice.dueDate).toLocaleDateString()}
          </p>
          <p>
            <strong>Total:</strong> ${invoice.total.toFixed(2)}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="invoices-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2>Invoices</h2>
          <p style={{ marginTop: "4px", fontSize: "0.9em", color: "#64748b" }}>
            Invoices are automatically created and updated from sales. Auto-generated invoices are marked with "(Auto-generated)".
          </p>
        </div>
        <button
          className="clear-button"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Cancel" : "Create Invoice"}
        </button>
      </div>

      {showForm && (
        <section className="panel">
          <h3>{editingInvoice ? "Edit Invoice" : "Create New Invoice"}</h3>
          <form onSubmit={handleSubmit} className="inventory-form">
            <div className="form-grid">
              <label>
                <span>Invoice Number *</span>
                <input
                  type="text"
                  value={formData.invoiceNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, invoiceNumber: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Client *</span>
                <select
                  value={formData.clientId}
                  onChange={(e) =>
                    setFormData({ ...formData, clientId: e.target.value })
                  }
                  required
                >
                  <option value="">Select a client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Date *</span>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Due Date *</span>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData({ ...formData, dueDate: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Tax (%)</span>
                <input
                  type="number"
                  value={formData.tax}
                  onChange={(e) =>
                    setFormData({ ...formData, tax: Number(e.target.value) })
                  }
                  min={0}
                  step={0.01}
                />
              </label>
              <label>
                <span>Status</span>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as Invoice["status"]
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </label>
            </div>

            <div className="invoice-items-section">
              <h4>Items</h4>
              <div className="form-grid">
                <label>
                  <span>Inventory Item *</span>
                  <select
                    value={currentItem.inventoryItemId}
                    onChange={(e) =>
                      setCurrentItem({ ...currentItem, inventoryItemId: e.target.value })
                    }
                  >
                    <option value="">Select an item from warehouse</option>
                    {availableInventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (SKU: {item.sku}){" "}
                        {(() => {
                          const warehouse = getWarehouseById(item.warehouseId);
                          return warehouse
                            ? `· Warehouse: ${warehouse.name}`
                            : "· Warehouse: Unassigned";
                        })()}{" "}
                        - Available: {item.quantity} {item.unit} @ ${item.finalPrice.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Quantity *</span>
                  <input
                    type="number"
                    value={currentItem.quantity}
                    onChange={(e) =>
                      setCurrentItem({
                        ...currentItem,
                        quantity: Number(e.target.value)
                      })
                    }
                    min={1}
                    max={selectedInventoryItem?.quantity || 1}
                  />
                  {selectedInventoryItem && (
                    <small style={{ color: "#64748b", marginTop: "4px", display: "block" }}>
                      Available: {selectedInventoryItem.quantity} {selectedInventoryItem.unit}
                    </small>
                  )}
                </label>
                <label>
                  <span>Action</span>
                  <button
                    type="button"
                    onClick={addItemToInvoice}
                    className="secondary"
                    disabled={!currentItem.inventoryItemId || currentItem.quantity <= 0}
                  >
                    Add Item
                  </button>
                </label>
              </div>

              {formData.items.length > 0 && (
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.name}
                          {item.sku && (
                            <span style={{ display: "block", fontSize: "0.8em", color: "#64748b" }}>
                              SKU: {item.sku}
                            </span>
                          )}
                        </td>
                        <td>{item.quantity}</td>
                        <td>${item.unitPrice.toFixed(2)}</td>
                        <td>${item.total.toFixed(2)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => removeItemFromInvoice(item.id)}
                            className="icon-button"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="invoice-totals">
                <div>
                  <strong>Subtotal:</strong> ${calculations.subtotal.toFixed(2)}
                </div>
                <div>
                  <strong>Tax:</strong> ${calculations.taxAmount.toFixed(2)}
                </div>
                <div className="invoice-total">
                  <strong>Total:</strong> ${calculations.total.toFixed(2)}
                </div>
              </div>
            </div>

            <label className="notes-field">
              <span>Notes</span>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
              />
            </label>

            <div className="form-actions">
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit">
                {editingInvoice ? "Save Changes" : "Create Invoice"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel sold-by-month-panel">
        <div className="sold-by-month-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggleSection("soldByMonth")}>
          <h3 style={{ margin: 0 }}>Sold by month · Who received what</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
              <label>
                <span>Year</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  style={{ padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Month</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  style={{ padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  {monthNames.map((name, index) => (
                    <option key={index + 1} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection("soldByMonth");
              }}
              style={{
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                fontSize: "1.2em",
                cursor: "pointer",
                padding: "6px 12px",
                borderRadius: "4px",
                fontWeight: "500"
              }}
              title={sectionVisibility.soldByMonth ? "Hide section" : "Show section"}
            >
              {sectionVisibility.soldByMonth ? "↓" : "↑"}
            </button>
          </div>
        </div>
        {sectionVisibility.soldByMonth && (
          <>
            {soldByMonth.length === 0 ? (
          <div className="empty-state">
            No invoices in {monthNames[selectedMonth - 1]} {selectedYear}. Create invoices to see sold items per client here.
          </div>
        ) : (
          <div className="sold-by-month-clients">
            {soldByMonth.map(({ clientId, clientName, invoices: clientInvoices }) => (
              <div key={clientId} className="sold-by-month-client">
                <h4 className="sold-by-month-client-name">{clientName}</h4>
                {clientInvoices.map((inv) => (
                  <div key={inv.id} className="sold-by-month-invoice">
                    <div className="sold-by-month-invoice-meta">
                      <span className="sold-invoice-num">
                        {new Date(inv.date).toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric"
                        })}
                      </span>
                      <span className="sold-invoice-date">
                        {new Date(inv.date).toLocaleDateString()}
                      </span>
                      <span className="sold-invoice-total">${inv.total.toFixed(2)}</span>
                    </div>
                    <table className="inventory-table sold-items-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Unit price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inv.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>{item.quantity}</td>
                            <td>${item.unitPrice.toFixed(2)}</td>
                            <td>${item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))}
          </div>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggleSection("activeInvoices")}>
          <h3 style={{ margin: 0 }}>Active Invoices ({activeInvoices.length})</h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection("activeInvoices");
            }}
            style={{
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              fontSize: "1.2em",
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: "4px",
              fontWeight: "500"
            }}
            title={sectionVisibility.activeInvoices ? "Hide section" : "Show section"}
          >
            {sectionVisibility.activeInvoices ? "↓" : "↑"}
          </button>
        </div>
        {sectionVisibility.activeInvoices && (
          <>
            {activeInvoices.length === 0 ? (
          <div className="empty-state">No active invoices. Sent invoices are archived below.</div>
        ) : (
          <div className="invoices-list">
            {activeInvoices.map((invoice) => renderInvoiceCard(invoice))}
          </div>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggleSection("sentInvoices")}>
          <h3 style={{ margin: 0 }}>Sent Invoices ({sentInvoices.length})</h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection("sentInvoices");
            }}
            style={{
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              fontSize: "1.2em",
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: "4px",
              fontWeight: "500"
            }}
            title={sectionVisibility.sentInvoices ? "Hide section" : "Show section"}
          >
            {sectionVisibility.sentInvoices ? "↓" : "↑"}
          </button>
        </div>
        {sectionVisibility.sentInvoices && (
          <>
            {sentInvoices.length === 0 ? (
          <div className="empty-state">No sent invoices yet. Invoices will be automatically archived here once sent.</div>
        ) : (
          <div className="invoices-list">
            {sentInvoices.map((invoice) => renderInvoiceCard(invoice))}
          </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
