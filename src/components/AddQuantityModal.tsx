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
        <div className="add-qty-header">
          <h3>Add to &quot;{item.name}&quot;</h3>
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="add-qty-current">
          Current quantity: <strong>{item.quantity} {item.unit}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <label className="add-qty-field">
            <span className="add-qty-field-label">How many to add?</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => {
                const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                setQuantity(v);
                if (quantityToBill > v) setQuantityToBill(v);
              }}
            />
          </label>

          {clients.length > 0 && (
            <div className="add-qty-bill-section">
              <label className="add-qty-bill-checkbox">
                <input
                  type="checkbox"
                  checked={alsoBillToClient}
                  onChange={(e) => setAlsoBillToClient(e.target.checked)}
                />
                <span>Also bill to client</span>
              </label>
              {alsoBillToClient && (
                <div className="add-qty-bill-fields">
                  <label className="add-qty-field">
                    <span className="add-qty-field-label">Client</span>
                    <select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    >
                      <option value="">Select client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="add-qty-field">
                    <span className="add-qty-field-label">Quantity to bill (max {quantity})</span>
                    <input
                      type="number"
                      min={1}
                      max={quantity}
                      value={quantityToBill}
                      onChange={(e) => setQuantityToBill(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    />
                    {quantityToBill > 0 && (
                      <p className="add-qty-line-total">
                        Line total: ${lineTotal.toFixed(2)} (qty × ${item.finalPrice.toFixed(2)})
                      </p>
                    )}
                  </label>
                </div>
              )}
            </div>
          )}

          {error && <p className="add-qty-error">{error}</p>}
          <div className="add-qty-actions">
            <button type="button" className="secondary" onClick={onClose}>
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
