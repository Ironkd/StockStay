import React, { useState } from "react";
import { InventoryItem, Client } from "../types";

type Props = {
  item: InventoryItem;
  clients: Client[];
  onClose: () => void;
  onSubmit: (quantity: number, billToClient: boolean, clientId: string | null) => Promise<void>;
};

export const SubtractItemModal: React.FC<Props> = ({
  item,
  clients,
  onClose,
  onSubmit,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [billToClient, setBillToClient] = useState(false);
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
    if (billToClient && !clientId) {
      setError("Select a client to bill.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(quantity, billToClient, billToClient ? clientId : null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content subtract-item-modal add-quantity-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-qty-header">
          <h3>Subtract from &quot;{item.name}&quot;</h3>
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="add-qty-current">
          Current quantity: <strong>{item.quantity} {item.unit}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <label className="add-qty-field">
            <span className="add-qty-field-label">How many to take out?</span>
            <input
              type="number"
              min={1}
              max={maxQty}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </label>
          {clients.length > 0 && (
            <div className="add-qty-bill-section">
              <label className="add-qty-bill-checkbox">
                <input
                  type="checkbox"
                  checked={billToClient}
                  onChange={(e) => setBillToClient(e.target.checked)}
                />
                <span>Bill to client (create invoice and deduct from stock)</span>
              </label>
              {billToClient && (
                <>
                  <label className="add-qty-field add-qty-bill-fields">
                    <span className="add-qty-field-label">Client</span>
                    <select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      required={billToClient}
                    >
                      <option value="">Select client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {quantity > 0 && (
                      <p className="add-qty-line-total">
                        Line total: ${lineTotal.toFixed(2)} (qty × ${item.finalPrice.toFixed(2)})
                      </p>
                    )}
                  </label>
                </>
              )}
            </div>
          )}
          {error && <p className="add-qty-error">{error}</p>}
          <div className="add-qty-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Saving…" : "Subtract"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
