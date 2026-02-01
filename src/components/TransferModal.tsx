import React, { useState, useMemo } from "react";
import { InventoryItem, Warehouse } from "../types";

export interface TransferFormValues {
  fromWarehouseId: string;
  toWarehouseId: string;
  inventoryItemId: string;
  quantity: number;
}

interface TransferModalProps {
  items: InventoryItem[];
  warehouses: Warehouse[];
  onSubmit: (values: TransferFormValues) => Promise<void>;
  onClose: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  items,
  warehouses,
  onSubmit,
  onClose,
}) => {
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const itemsInFromWarehouse = useMemo(() => {
    if (!fromWarehouseId) return [];
    return items.filter(
      (i) => i.warehouseId === fromWarehouseId && i.quantity > 0
    );
  }, [items, fromWarehouseId]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === inventoryItemId),
    [items, inventoryItemId]
  );

  const toWarehouseOptions = useMemo(
    () => warehouses.filter((w) => w.id !== fromWarehouseId),
    [warehouses, fromWarehouseId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const qty = parseFloat(quantity);
    if (!fromWarehouseId || !toWarehouseId || !inventoryItemId || !quantity) {
      setError("Please fill in all fields.");
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      setError("From and To warehouses must be different.");
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid quantity.");
      return;
    }
    if (selectedItem && qty > selectedItem.quantity) {
      setError(`Maximum quantity available is ${selectedItem.quantity}.`);
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        fromWarehouseId,
        toWarehouseId,
        inventoryItemId,
        quantity: qty,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFromWarehouseChange = (id: string) => {
    setFromWarehouseId(id);
    setInventoryItemId("");
    setQuantity("");
  };

  const handleItemChange = (id: string) => {
    setInventoryItemId(id);
    setQuantity("");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "480px" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h3>Transfer Between Warehouses</h3>
          <button
            type="button"
            className="icon-button close-button"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="inventory-form">
          {error && (
            <div className="error-message" style={{ marginBottom: "16px" }}>
              {error}
            </div>
          )}

          <div className="form-grid">
            <label>
              <span>From warehouse</span>
              <select
                value={fromWarehouseId}
                onChange={(e) => handleFromWarehouseChange(e.target.value)}
                required
              >
                <option value="">Select warehouse...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>To warehouse</span>
              <select
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
                required
                disabled={!fromWarehouseId}
              >
                <option value="">Select warehouse...</option>
                {toWarehouseOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            <span>Product</span>
            <select
              value={inventoryItemId}
              onChange={(e) => handleItemChange(e.target.value)}
              required
              disabled={itemsInFromWarehouse.length === 0}
            >
              <option value="">Select product...</option>
              {itemsInFromWarehouse.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.sku ? ` (${item.sku})` : ""} — {item.quantity}{" "}
                  {item.unit || "units"} available
                </option>
              ))}
            </select>
            {fromWarehouseId && itemsInFromWarehouse.length === 0 && (
              <small style={{ color: "#64748b", marginTop: "4px" }}>
                No products with stock in this warehouse.
              </small>
            )}
          </label>

          <label>
            <span>Amount to transfer</span>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={
                selectedItem
                  ? `Max: ${selectedItem.quantity}`
                  : "Enter quantity"
              }
              min="0.001"
              step="any"
              required
              disabled={!selectedItem}
            />
            {selectedItem && (
              <small style={{ color: "#64748b", marginTop: "4px" }}>
                Available: {selectedItem.quantity} {selectedItem.unit || "units"}
              </small>
            )}
          </label>

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "24px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              className="secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={loading || !fromWarehouseId || !toWarehouseId || !inventoryItemId || !quantity}
            >
              {loading ? "Transferring..." : "Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
