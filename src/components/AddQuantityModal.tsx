import React, { useState } from "react";
import { InventoryItem, Client } from "../types";

export type AddQuantityBillToClient = {
  clientId: string;
  quantityToBill: number;
};

type Props = {
  item: InventoryItem;
  clients?: Client[];
  onClose: () => void;
  onSubmit: (quantity: number, billToClient?: AddQuantityBillToClient) => Promise<void>;
};

export const AddQuantityModal: React.FC<Props> = ({ item, clients = [], onClose, onSubmit }) => {
  const [quantity, setQuantity] = useState(1);
  const [alsoBillToClient, setAlsoBillToClient] = useState(false);
  const [clientId, setClientId] = useState("");
  const [quantityToBill, setQuantityToBill] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const maxBill = quantity;
  const effectiveQtyToBill = Math.min(Math.max(1, quantityToBill), maxBill);
  const lineTotal = effectiveQtyToBill * item.finalPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (quantity <= 0) {
      setError("Enter a quantity of at least 1.");
      return;
    }
    if (alsoBillToClient) {
      if (!clientId) {
        setError("Select a client to bill.");
        return;
      }
      if (quantityToBill <= 0 || quantityToBill > quantity) {
        setError(`Quantity to bill must be between 1 and ${quantity}.`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const billToClient = alsoBillToClient && clientId
        ? { clientId, quantityToBill: effectiveQtyToBill }
        : undefined;
      await onSubmit(quantity, billToClient);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-quantity-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3>Add to &quot;{item.name}&quot;</h3>
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "14px" }}>
          Current quantity: <strong>{item.quantity} {item.unit}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: "12px" }}>
            <span style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>How many to add?</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => {
                const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                setQuantity(v);
                if (quantityToBill > v) setQuantityToBill(v);
              }}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}
            />
          </label>

          {clients.length > 0 && (
            <div style={{ marginBottom: "16px", padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginBottom: alsoBillToClient ? "12px" : 0 }}>
                <input
                  type="checkbox"
                  checked={alsoBillToClient}
                  onChange={(e) => setAlsoBillToClient(e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Also bill to client</span>
              </label>
              {alsoBillToClient && (
                <>
                  <label style={{ display: "block", marginBottom: "8px" }}>
                    <span style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Client</span>
                    <select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}
                    >
                      <option value="">Select client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "block", marginBottom: "0" }}>
                    <span style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Quantity to bill (max {quantity})</span>
                    <input
                      type="number"
                      min={1}
                      max={quantity}
                      value={quantityToBill}
                      onChange={(e) => setQuantityToBill(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}
                    />
                    {quantityToBill > 0 && (
                      <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#64748b" }}>
                        Line total: ${lineTotal.toFixed(2)} (qty × ${item.finalPrice.toFixed(2)})
                      </p>
                    )}
                  </label>
                </>
              )}
            </div>
          )}

          {error && <p style={{ color: "#dc2626", margin: "0 0 12px", fontSize: "14px" }}>{error}</p>}
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
