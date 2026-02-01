import React, { useState, useMemo } from "react";
import { InventoryItem, Warehouse } from "../types";

export interface TransferFormValues {
  fromWarehouseId: string;
  toWarehouseId: string;
  inventoryItemId: string;
  quantity: number;
}

interface TransferLine {
  id: string;
  inventoryItemId: string;
  quantity: string;
}

interface TransferModalProps {
  items: InventoryItem[];
  warehouses: Warehouse[];
  onSubmit: (values: TransferFormValues) => Promise<void>;
  onClose: () => void;
}

const newLine = (): TransferLine => ({
  id: crypto.randomUUID(),
  inventoryItemId: "",
  quantity: "",
});

export const TransferModal: React.FC<TransferModalProps> = ({
  items,
  warehouses,
  onSubmit,
  onClose,
}) => {
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([newLine()]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const itemsInFromWarehouse = useMemo(() => {
    if (!fromWarehouseId) return [];
    return items.filter(
      (i) => i.warehouseId === fromWarehouseId && i.quantity > 0
    );
  }, [items, fromWarehouseId]);

  const toWarehouseOptions = useMemo(
    () => warehouses.filter((w) => w.id !== fromWarehouseId),
    [warehouses, fromWarehouseId]
  );

  const filledLines = useMemo(
    () =>
      lines.filter(
        (l) => l.inventoryItemId.trim() !== "" && l.quantity.trim() !== ""
      ),
    [lines]
  );

  const addLine = () => {
    setLines((prev) => [...prev, newLine()]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const updateLine = (id: string, field: "inventoryItemId" | "quantity", value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const handleFromWarehouseChange = (id: string) => {
    setFromWarehouseId(id);
    setLines([newLine()]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!fromWarehouseId || !toWarehouseId) {
      setError("Please select From and To warehouses.");
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      setError("From and To warehouses must be different.");
      return;
    }
    if (filledLines.length === 0) {
      setError("Add at least one product with a quantity.");
      return;
    }
    for (const line of filledLines) {
      const qty = parseFloat(line.quantity);
      const item = items.find((i) => i.id === line.inventoryItemId);
      if (!item) {
        setError(`Product not found for one of the lines.`);
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        setError(`Enter a valid quantity for ${item.name}.`);
        return;
      }
      if (qty > item.quantity) {
        setError(`${item.name}: maximum quantity available is ${item.quantity}.`);
        return;
      }
    }
    setLoading(true);
    try {
      for (const line of filledLines) {
        await onSubmit({
          fromWarehouseId,
          toWarehouseId,
          inventoryItemId: line.inventoryItemId,
          quantity: parseFloat(line.quantity),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "560px" }}
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

          <div style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontWeight: 600, fontSize: "14px" }}>Products</span>
              <button
                type="button"
                className="secondary"
                onClick={addLine}
                disabled={itemsInFromWarehouse.length === 0}
                style={{ fontSize: "13px" }}
              >
                + Add product
              </button>
            </div>
            {lines.map((line) => {
              const selectedItem = items.find((i) => i.id === line.inventoryItemId);
              return (
                <div
                  key={line.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 100px 44px",
                    gap: "12px",
                    alignItems: "end",
                    marginBottom: "12px",
                  }}
                >
                  <label style={{ marginBottom: 0 }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>Product</span>
                    <select
                      value={line.inventoryItemId}
                      onChange={(e) => updateLine(line.id, "inventoryItemId", e.target.value)}
                      disabled={itemsInFromWarehouse.length === 0}
                    >
                      <option value="">Select product...</option>
                      {itemsInFromWarehouse.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.sku ? ` (${item.sku})` : ""} — {item.quantity}{" "}
                          {item.unit || "units"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ marginBottom: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>Qty</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                        placeholder={selectedItem ? `Max: ${selectedItem.quantity}` : "Qty"}
                        min="0.001"
                        step="any"
                        disabled={!line.inventoryItemId}
                      />
                      {selectedItem && (
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          {selectedItem.unit || "units"}
                        </span>
                      )}
                    </div>
                  </label>
                  <button
                    type="button"
                    className="icon-button transfer-remove-line"
                    onClick={() => removeLine(line.id)}
                    disabled={lines.length === 1}
                    aria-label="Remove product"
                    style={{ padding: "8px", opacity: lines.length === 1 ? 0.4 : 1, marginBottom: "2px" }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          {fromWarehouseId && itemsInFromWarehouse.length === 0 && (
            <small style={{ color: "#64748b", marginTop: "4px" }}>
              No products with stock in this warehouse.
            </small>
          )}

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
              disabled={
                loading ||
                !fromWarehouseId ||
                !toWarehouseId ||
                filledLines.length === 0
              }
            >
              {loading ? "Transferring..." : "Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
