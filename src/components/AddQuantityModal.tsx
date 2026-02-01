import React, { useState } from "react";
import { InventoryItem } from "../types";

type Props = {
  item: InventoryItem;
  onClose: () => void;
  onSubmit: (quantity: number) => Promise<void>;
};

export const AddQuantityModal: React.FC<Props> = ({ item, onClose, onSubmit }) => {
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (quantity <= 0) {
      setError("Enter a quantity of at least 1.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(quantity);
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
              onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}
            />
          </label>
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
