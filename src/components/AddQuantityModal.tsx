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
      setError("Enter a quantity greater than zero.");
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
      <div
        className="modal-content add-quantity-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0 }}>Add quantity</h3>
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p style={{ marginTop: 0, color: "#64748b", fontSize: "14px" }}>
          {item.name} · on hand {item.quantity} {item.unit || "units"}
        </p>
        <p style={{ fontSize: "13px", color: "#64748b" }}>
          To deploy stock to a property with bill-back, use <strong>Replenish</strong>.
        </p>
        <form onSubmit={handleSubmit} className="inventory-form">
          <label>
            <span>Quantity to add</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
          </label>
          {error && (
            <p style={{ color: "#b91c1c", fontSize: "14px" }} role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
