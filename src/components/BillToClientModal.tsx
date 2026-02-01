import React, { useState } from "react";
import { InventoryItem, Client } from "../types";

type Props = {
  item: InventoryItem;
  clients: Client[];
  onClose: () => void;
  onSubmit: (quantity: number, clientId: string) => Promise<void>;
};

export const BillToClientModal: React.FC<Props> = ({
  item,
  clients,
  onClose,
  onSubmit,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [clientId, setClientId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const maxQty = Math.max(0, item.quantity);
  const lineTotal = quantity * item.finalPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (quantity <= 0 || quantity > maxQty) {
      setError(`Enter a quantity between 1 and ${maxQty}.`);
      return;
    }
    if (!clientId) {
      setError("Select a client to bill.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(quantity, clientId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bill-to-client-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3>Bill to client: &quot;{item.name}&quot;</h3>
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "14px" }}>
          Current quantity: <strong>{item.quantity} {item.unit}</strong>. Creating an invoice will deduct from stock.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: "12px" }}>
            <span style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>Quantity to bill</span>
            <input
              type="number"
              min={1}
              max={maxQty}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}
            />
          </label>
          <label style={{ display: "block", marginBottom: "12px" }}>
            <span style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>Client</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {quantity > 0 && (
              <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#64748b" }}>
                Line total: ${lineTotal.toFixed(2)} (qty × ${item.finalPrice.toFixed(2)})
              </p>
            )}
          </label>
          {error && <p style={{ color: "#dc2626", margin: "0 0 12px", fontSize: "14px" }}>{error}</p>}
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
