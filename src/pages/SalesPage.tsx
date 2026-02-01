import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSales } from "../hooks/useSales";
import { useClients } from "../hooks/useClients";
import { useInventory } from "../hooks/useInventory";
import { useWarehouses } from "../hooks/useWarehouses";
import { Sale, SaleItem } from "../types";

// Province to tax rate mapping (Canadian provinces/territories)
const PROVINCE_TAX_RATES: Record<string, number> = {
  "Alberta": 5.0, // GST only
  "British Columbia": 12.0, // GST 5% + PST 7%
  "BC": 12.0,
  "Manitoba": 12.0, // GST 5% + PST 7%
  "MB": 12.0,
  "New Brunswick": 15.0, // HST
  "NB": 15.0,
  "Newfoundland and Labrador": 15.0, // HST
  "NL": 15.0,
  "Northwest Territories": 5.0, // GST only
  "NT": 5.0,
  "Nova Scotia": 15.0, // HST
  "NS": 15.0,
  "Nunavut": 5.0, // GST only
  "NU": 5.0,
  "Ontario": 13.0, // HST
  "ON": 13.0,
  "Prince Edward Island": 15.0, // HST
  "PEI": 15.0,
  "PE": 15.0,
  "Quebec": 14.975, // GST 5% + QST 9.975%
  "QC": 14.975,
  "Saskatchewan": 11.0, // GST 5% + PST 6%
  "SK": 11.0,
  "Yukon": 5.0, // GST only
  "YT": 5.0,
};

const getTaxRateByProvince = (province: string | undefined): number => {
  if (!province) return 0;
  const normalizedProvince = province.trim();
  return PROVINCE_TAX_RATES[normalizedProvince] || PROVINCE_TAX_RATES[normalizedProvince.toUpperCase()] || 0;
};

export const SalesPage: React.FC = () => {
  const { sales, addSale, updateSale, removeSale } = useSales();
  const { clients } = useClients();
  const { items, refresh: refreshInventory } = useInventory();
  const { getWarehouseById } = useWarehouses();
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);

  const getNextSaleNumber = () => {
    const numericSaleNumbers = sales
      .map((sale) => parseInt(sale.saleNumber, 10))
      .filter((n) => !Number.isNaN(n));
    const next = numericSaleNumbers.length ? Math.max(...numericSaleNumbers) + 1 : 1;
    return String(next);
  };

  const [formData, setFormData] = useState({
    saleNumber: getNextSaleNumber(),
    clientId: "",
    date: new Date().toISOString().split("T")[0],
    items: [] as SaleItem[],
    tax: 0,
    notes: ""
  });

  const [currentItem, setCurrentItem] = useState({
    inventoryItemId: "",
    quantity: 1
  });

  const resetForm = () => {
    setFormData({
      saleNumber: getNextSaleNumber(),
      clientId: "",
      date: new Date().toISOString().split("T")[0],
      items: [],
      tax: 0,
      notes: ""
    });
    setCurrentItem({ inventoryItemId: "", quantity: 1 });
    setEditingSale(null);
    setShowForm(false);
  };

  const selectedInventoryItem = useMemo(() => {
    return items.find((item) => item.id === currentItem.inventoryItemId);
  }, [items, currentItem.inventoryItemId]);

  const addItemToSale = () => {
    if (!currentItem.inventoryItemId || currentItem.quantity <= 0) {
      alert("Please select an item and enter quantity");
      return;
    }

    const inventoryItem = selectedInventoryItem;
    if (!inventoryItem) {
      alert("Selected inventory item not found");
      return;
    }

    // Check if item already exists in sale items
    const existingItemIndex = formData.items.findIndex(
      (item) => item.inventoryItemId === currentItem.inventoryItemId
    );

    if (existingItemIndex >= 0) {
      // Update existing item quantity
      const updatedItems = [...formData.items];
      const newQuantity = updatedItems[existingItemIndex].quantity + currentItem.quantity;
      updatedItems[existingItemIndex] = {
        ...updatedItems[existingItemIndex],
        quantity: newQuantity,
        total: newQuantity * updatedItems[existingItemIndex].unitPrice
      };
      setFormData({ ...formData, items: updatedItems });
    } else {
      // Add new item
      const newItem: SaleItem = {
        id: crypto.randomUUID(),
        inventoryItemId: inventoryItem.id,
        inventoryItemName: inventoryItem.name,
        sku: inventoryItem.sku,
        quantity: currentItem.quantity,
        unitPrice: inventoryItem.finalPrice,
        total: currentItem.quantity * inventoryItem.finalPrice
      };
      setFormData({
        ...formData,
        items: [...formData.items, newItem]
      });
    }
    setCurrentItem({ inventoryItemId: "", quantity: 1 });
  };

  const removeItemFromSale = (itemId: string) => {
    setFormData({
      ...formData,
      items: formData.items.filter((item) => item.id !== itemId)
    });
  };

  const updateItemQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItemFromSale(itemId);
      return;
    }
    setFormData({
      ...formData,
      items: formData.items.map((item) =>
        item.id === itemId
          ? { ...item, quantity: newQuantity, total: newQuantity * item.unitPrice }
          : item
      )
    });
  };

  const calculations = useMemo(() => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = (subtotal * formData.tax) / 100;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  }, [formData.items, formData.tax]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.saleNumber || !formData.clientId) {
      alert("Sale number and client are required");
      return;
    }

    if (formData.items.length === 0) {
      alert("Please add at least one item to the sale");
      return;
    }

    // Validate quantities don't exceed available inventory
    for (const saleItem of formData.items) {
      const inventoryItem = items.find((item) => item.id === saleItem.inventoryItemId);
      if (!inventoryItem) {
        alert(`Inventory item ${saleItem.inventoryItemName} not found`);
        return;
      }
      if (saleItem.quantity > inventoryItem.quantity) {
        alert(
          `Insufficient stock for ${saleItem.inventoryItemName}. Available: ${inventoryItem.quantity}, Requested: ${saleItem.quantity}`
        );
        return;
      }
    }

    const selectedClient = clients.find((c) => c.id === formData.clientId);
    if (!selectedClient) {
      alert("Please select a valid client");
      return;
    }

    const saleData = {
      ...formData,
      clientName: selectedClient.name,
      subtotal: calculations.subtotal,
      total: calculations.total
    };

    try {
      if (editingSale) {
        await updateSale(editingSale.id, saleData);
        setCreatedInvoiceId(null);
      } else {
        const response = await addSale(saleData);
        // Refresh inventory to reflect updated quantities
        await refreshInventory();
        // Invoice is created on the server when possible; notify so Invoices page shows it
        if (response.invoice) {
          setCreatedInvoiceId(response.invoice.id);
        } else {
          setCreatedInvoiceId(null);
        }
        window.dispatchEvent(new CustomEvent("invoices-refresh"));
      }
      resetForm();
    } catch (err) {
      console.error("Error saving sale:", err);
      const message = err instanceof Error ? err.message : "Failed to save sale. Please try again.";
      alert(message);
    }
  };

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale);
    setFormData({
      saleNumber: sale.saleNumber,
      clientId: sale.clientId,
      date: sale.date,
      items: sale.items,
      tax: (sale.tax / sale.subtotal) * 100 || 0,
      notes: sale.notes || ""
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this sale?")) {
      try {
        await removeSale(id);
        await refreshInventory();
      } catch (err) {
        console.error("Error deleting sale:", err);
        const msg = err instanceof Error ? err.message : "Failed to delete sale. Please try again.";
        alert(msg);
      }
    }
  };

  // Auto-populate tax based on client's province (only when creating new sale, not editing)
  useEffect(() => {
    if (!editingSale && formData.clientId) {
      const selectedClient = clients.find((c) => c.id === formData.clientId);
      if (selectedClient?.province) {
        const taxRate = getTaxRateByProvince(selectedClient.province);
        if (taxRate > 0) {
          setFormData((prev) => ({ ...prev, tax: taxRate }));
        }
      }
    }
  }, [formData.clientId, clients, editingSale]);

  // Filter items that have available stock
  const availableItems = useMemo(() => {
    return items.filter((item) => item.quantity > 0);
  }, [items]);

  return (
    <div className="sales-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h2>Sales</h2>
        <button
          className="clear-button"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
        >
          {showForm ? "Cancel" : "Create Sale"}
        </button>
      </div>

      {createdInvoiceId && (
        <div className="sale-created-invoice-banner" role="status">
          Sale created. Invoice created —{" "}
          <Link to="/invoices" className="sale-created-invoice-link">
            View invoice
          </Link>
          <button
            type="button"
            className="banner-dismiss"
            onClick={() => setCreatedInvoiceId(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {showForm && (
        <section className="panel">
          <h3>{editingSale ? "Edit Sale" : "Create New Sale"}</h3>
          <form onSubmit={handleSubmit} className="inventory-form">
            <div className="form-grid">
              <label>
                <span>Sale Number *</span>
                <input
                  type="text"
                  value={formData.saleNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, saleNumber: e.target.value })
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
                {formData.clientId && (() => {
                  const selectedClient = clients.find((c) => c.id === formData.clientId);
                  const province = selectedClient?.province;
                  if (province) {
                    const taxRate = getTaxRateByProvince(province);
                    if (taxRate > 0 && formData.tax === taxRate) {
                      return (
                        <small style={{ color: "#64748b", marginTop: "4px", display: "block" }}>
                          Auto-filled from {selectedClient.name}'s province: {province}
                        </small>
                      );
                    }
                  }
                  return null;
                })()}
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
                    <option value="">Select an item</option>
                    {availableItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (SKU: {item.sku}){" "}
                        {(() => {
                          const warehouse = getWarehouseById(item.warehouseId);
                          return warehouse ? `· Warehouse: ${warehouse.name}` : "· Warehouse: Unassigned";
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
                    onClick={addItemToSale}
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
                      <th>SKU</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item) => {
                      const inventoryItem = items.find((i) => i.id === item.inventoryItemId);
                      return (
                        <tr key={item.id}>
                          <td>{item.inventoryItemName}</td>
                          <td>{item.sku}</td>
                          <td>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItemQuantity(item.id, Number(e.target.value))
                              }
                              min={1}
                              max={inventoryItem?.quantity || item.quantity}
                              style={{ width: "80px" }}
                            />
                          </td>
                          <td>${item.unitPrice.toFixed(2)}</td>
                          <td>${item.total.toFixed(2)}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => removeItemFromSale(item.id)}
                              className="icon-button"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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
                {editingSale ? "Save Changes" : "Create Sale"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <h3>All Sales ({sales.length})</h3>
        {sales.length === 0 ? (
          <div className="empty-state">No sales yet. Create your first sale above.</div>
        ) : (
          <div className="invoices-list">
            {sales.map((sale) => (
              <div key={sale.id} className="invoice-card">
                <div className="invoice-header">
                  <div>
                    <h4>#{sale.saleNumber}</h4>
                    <p>{sale.clientName}</p>
                  </div>
                  <div className="invoice-meta">
                    <div className="invoice-actions">
                      <button
                        className="icon-button"
                        onClick={() => handleEdit(sale)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => handleDelete(sale.id)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
                <div className="invoice-details">
                  <p>
                    <strong>Date:</strong> {new Date(sale.date).toLocaleDateString()}
                  </p>
                  <p>
                    <strong>Items:</strong> {sale.items.length} item(s)
                  </p>
                  <p>
                    <strong>Total:</strong> ${sale.total.toFixed(2)}
                  </p>
                </div>
                {sale.items.length > 0 && (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                    <table className="inventory-table" style={{ fontSize: "0.9em" }}>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>SKU</th>
                          <th>Qty</th>
                          <th>Price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sale.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.inventoryItemName}</td>
                            <td>{item.sku}</td>
                            <td>{item.quantity}</td>
                            <td>${item.unitPrice.toFixed(2)}</td>
                            <td>${item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
