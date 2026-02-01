import React, { useState, useMemo, useEffect } from "react";
import { useInvoices } from "../hooks/useInvoices";
import { useClients } from "../hooks/useClients";
import { useSales } from "../hooks/useSales";
import { useInventory } from "../hooks/useInventory";
import { useProperties } from "../hooks/useProperties";
import { invoicesApi } from "../services/invoicesApi";
import { teamApi } from "../services/teamApi";
import { Invoice, InvoiceItem } from "../types";

export const InvoicesPage: React.FC = () => {
  const { invoices, addInvoice, updateInvoice, removeInvoice, refresh: refreshInvoices } = useInvoices();
  const { clients } = useClients();
  const { sales, refresh: refreshSales } = useSales();
   // Inventory & properties for picking items into invoices
  const { items: inventoryItems, refresh: refreshInventory } = useInventory();
  const { getPropertyById } = useProperties();
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sendPreviewInvoice, setSendPreviewInvoice] = useState<Invoice | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [senderBranding, setSenderBranding] = useState<{ companyName: string; companyAddress: string; companyPhone: string; companyEmail: string } | null>(null);
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

  // Sender branding for invoice title and preview (company name, address, etc.)
  useEffect(() => {
    let cancelled = false;
    teamApi.getTeam().then((data) => {
      if (cancelled) return;
      const t = data.team;
      const style = t.invoiceStyle ?? {};
      setSenderBranding({
        companyName: (style.companyName ?? t.name ?? "Stock Stay").trim() || t.name || "Stock Stay",
        companyAddress: (style.companyAddress ?? "").trim(),
        companyPhone: (style.companyPhone ?? "").trim(),
        companyEmail: (style.companyEmail ?? "").trim(),
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
      alert("Please select an item from the property and enter a quantity");
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

  const { monthlyTotal, yearlyTotal } = useMemo(() => {
    const inMonth = (d: string) => {
      const dt = new Date(d);
      return dt.getFullYear() === selectedYear && dt.getMonth() + 1 === selectedMonth;
    };
    const inYear = (d: string) => new Date(d).getFullYear() === selectedYear;
    const monthly = invoices.filter((inv) => inMonth(inv.date)).reduce((sum, inv) => sum + (inv.total ?? 0), 0);
    const yearly = invoices.filter((inv) => inYear(inv.date)).reduce((sum, inv) => sum + (inv.total ?? 0), 0);
    return { monthlyTotal: monthly, yearlyTotal: yearly };
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
      tax: Math.round(formData.tax * 100) / 100,
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
    const taxRate =
      invoice.subtotal && invoice.subtotal !== 0
        ? (invoice.tax / invoice.subtotal) * 100
        : Number(invoice.tax);
    setFormData({
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      date: invoice.date,
      dueDate: invoice.dueDate,
      items: invoice.items,
      tax: Math.round((taxRate || 0) * 100) / 100,
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

  const handleSendClick = (invoice: Invoice) => {
    setSendPreviewInvoice(invoice);
  };

  const handleSendConfirm = async () => {
    if (!sendPreviewInvoice) return;
    const clientEmail = clients.find((c) => c.id === sendPreviewInvoice.clientId)?.email?.trim();
    if (!clientEmail) {
      alert("No email address for this client. Add an email in Clients before sending.");
      return;
    }
    setSendingInvoice(true);
    try {
      await invoicesApi.send(sendPreviewInvoice.id);
      await refreshInvoices();
      setSendPreviewInvoice(null);
      alert(`Invoice #${sendPreviewInvoice.invoiceNumber} sent to ${clientEmail}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send invoice. Please try again.";
      alert(message);
    } finally {
      setSendingInvoice(false);
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
    // Show who the invoice is from (company/sender name), not the number
    return senderBranding?.companyName ?? "Invoice";
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
            <p>{invoice.clientName} · #{invoice.invoiceNumber}</p>
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
                  onClick={() => handleSendClick(invoice)}
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

  const previewClientEmail = sendPreviewInvoice
    ? clients.find((c) => c.id === sendPreviewInvoice.clientId)?.email?.trim()
    : "";

  return (
    <div className="invoices-page">
      {sendPreviewInvoice && (
        <div
          className="invoice-send-preview-overlay"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px",
          }}
          onClick={() => !sendingInvoice && setSendPreviewInvoice(null)}
        >
          <div
            className="invoice-send-preview-modal"
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              maxWidth: "560px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "24px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>
                Preview – Invoice from {senderBranding?.companyName ?? "you"}
              </h3>
              <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "0.9rem" }}>
                This is how the invoice will look when sent by email.
              </p>
              <div
                style={{
                  fontFamily: "system-ui, sans-serif",
                  color: "#1e293b",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "20px",
                  marginBottom: "20px",
                  backgroundColor: "#f8fafc",
                }}
              >
                {senderBranding && (senderBranding.companyName || senderBranding.companyAddress || senderBranding.companyPhone || senderBranding.companyEmail) && (
                  <div style={{ marginBottom: "16px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>From</p>
                    <p style={{ margin: "0", fontSize: "14px", lineHeight: 1.5, color: "#334155" }}>
                      {senderBranding.companyName}
                      {senderBranding.companyAddress && (
                        <>
                          <br />
                          {senderBranding.companyAddress.split(/\n/).filter((l) => l.trim()).map((line, i) => (
                            <span key={i}>{line}<br /></span>
                          ))}
                        </>
                      )}
                      {senderBranding.companyPhone && <><br />Tel: {senderBranding.companyPhone}</>}
                      {senderBranding.companyEmail && <><br />{senderBranding.companyEmail}</>}
                    </p>
                  </div>
                )}
                <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bill to</p>
                <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#334155" }}>{sendPreviewInvoice.clientName}</p>
                <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: "1rem" }}>
                  Invoice {sendPreviewInvoice.invoiceNumber}
                </p>
                <p style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>
                  <strong>Date:</strong> {new Date(sendPreviewInvoice.date).toLocaleDateString()}
                </p>
                <p style={{ margin: "0 0 16px", fontSize: "0.9rem" }}>
                  <strong>Due date:</strong>{" "}
                  {sendPreviewInvoice.dueDate
                    ? new Date(sendPreviewInvoice.dueDate).toLocaleDateString()
                    : "—"}
                </p>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "8px 8px 8px 0" }}>Item</th>
                      <th style={{ textAlign: "right", padding: "8px" }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "8px" }}>Price</th>
                      <th style={{ textAlign: "right", padding: "8px" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sendPreviewInvoice.items || []).map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "8px 8px 8px 0" }}>{item.name}</td>
                        <td style={{ textAlign: "right", padding: "8px" }}>{item.quantity}</td>
                        <td style={{ textAlign: "right", padding: "8px" }}>
                          ${item.unitPrice.toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right", padding: "8px" }}>
                          ${item.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ margin: "0 0 4px", textAlign: "right", fontSize: "0.9rem" }}>
                  <strong>Subtotal:</strong> ${sendPreviewInvoice.subtotal.toFixed(2)}
                </p>
                <p style={{ margin: "0 0 4px", textAlign: "right", fontSize: "0.9rem" }}>
                  <strong>Tax:</strong> ${sendPreviewInvoice.tax.toFixed(2)}
                </p>
                <p style={{ margin: "0 0 0", textAlign: "right", fontSize: "1rem", fontWeight: 600 }}>
                  <strong>Total:</strong> ${sendPreviewInvoice.total.toFixed(2)}
                </p>
                {sendPreviewInvoice.notes && (
                  <p style={{ marginTop: "12px", color: "#64748b", fontSize: "0.875rem" }}>
                    {sendPreviewInvoice.notes}
                  </p>
                )}
              </div>
              <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "#64748b" }}>
                This will be sent to: <strong style={{ color: "#1e293b" }}>{previewClientEmail || "—"}</strong>
              </p>
              {!previewClientEmail && (
                <p style={{ margin: "0 0 16px", fontSize: "0.875rem", color: "#dc2626" }}>
                  No email for this client. Add an email in Clients before sending.
                </p>
              )}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="nav-button secondary"
                  onClick={() => setSendPreviewInvoice(null)}
                  disabled={sendingInvoice}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="nav-button primary"
                  onClick={handleSendConfirm}
                  disabled={sendingInvoice || !previewClientEmail}
                >
                  {sendingInvoice ? "Sending…" : `Send to ${previewClientEmail || "client"}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2>Invoices</h2>
          <p style={{ marginTop: "4px", fontSize: "0.9em", color: "#64748b" }}>
            Invoices are automatically created and updated from sales. Auto-generated invoices are marked with "(Auto-generated)".
          </p>
          <div className="invoice-totals-bar">
            <span className="invoice-total-item">
              <strong>Monthly total</strong> ({monthNames[selectedMonth - 1]} {selectedYear}):{" "}
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(monthlyTotal)}
            </span>
            <span className="invoice-total-item">
              <strong>Yearly total</strong> ({selectedYear}):{" "}
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(yearlyTotal)}
            </span>
          </div>
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
                    <option value="">Select an item from property</option>
                    {availableInventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (SKU: {item.sku}){" "}
                        {(() => {
                          const property = getPropertyById(item.propertyId);
                          return property
                            ? `· Property: ${property.name}`
                            : "· Property: Unassigned";
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
