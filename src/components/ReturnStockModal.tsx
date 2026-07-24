import React, { useEffect, useMemo, useState } from "react";
import type { Replenishment, ReplenishmentLine } from "../types";
import { replenishmentApi } from "../services/replenishmentApi";

type Props = {
  onClose: () => void;
  onSuccess: () => void;
};

type ChargeOption = {
  line: ReplenishmentLine;
  replenishment: Replenishment;
  remaining: number;
};

export const ReturnStockModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [options, setOptions] = useState<ChargeOption[]>([]);
  const [lineId, setLineId] = useState("");
  const [baseQty, setBaseQty] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      try {
        const rows = await replenishmentApi.list({ limit: 100 });
        const opts: ChargeOption[] = [];
        for (const rep of rows) {
          if (rep.direction !== "replenish") continue;
          for (const line of rep.lines || []) {
            if (line.reversesLineId) continue;
            const returned = (line.reversedBy || []).reduce(
              (sum, l) => sum + Math.abs(Number(l.baseQtyDeployed) || 0),
              0
            );
            const remaining = Math.max(0, (Number(line.baseQtyDeployed) || 0) - returned);
            if (remaining > 0.0000001) {
              opts.push({ line, replenishment: rep, remaining });
            }
          }
        }
        if (!cancelled) setOptions(opts);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => options.find((o) => o.line.id === lineId) || null,
    [options, lineId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!lineId) {
      setError("Select a replenishment line to reverse.");
      return;
    }
    const qty = Number(baseQty);
    if (!(qty > 0)) {
      setError("Enter a base quantity greater than zero.");
      return;
    }
    if (selected && qty > selected.remaining + 1e-9) {
      setError(`Cannot return more than ${selected.remaining} remaining.`);
      return;
    }
    setLoading(true);
    try {
      await replenishmentApi.createReturn({
        reversesLineId: lineId,
        baseQty: qty,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0 }}>Return stock</h3>
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p style={{ marginTop: 0, color: "#64748b", fontSize: "14px" }}>
          Return property stock to the stock location and queue an unbilled credit for the next invoice.
        </p>

        {loadingList ? (
          <p>Loading replenishment lines…</p>
        ) : options.length === 0 ? (
          <p>
            No returnable replenishment lines yet. Use <strong>Replenish</strong> to deploy
            stock to a property first; returns credit the next invoice.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="inventory-form">
            <label>
              <span>Replenishment line *</span>
              <select value={lineId} onChange={(e) => setLineId(e.target.value)} required>
                <option value="">Select line…</option>
                {options.map(({ line, replenishment, remaining }) => (
                  <option key={line.id} value={line.id}>
                    {(line.supplyItem?.name || line.sku?.name || "Item") +
                      ` · ${replenishment.property?.name || "Property"}` +
                      ` · remaining ${remaining.toFixed(2)}` +
                      ` · ${new Date(replenishment.createdAt).toLocaleDateString()}`}
                  </option>
                ))}
              </select>
            </label>

            {selected && (
              <p style={{ fontSize: "13px", color: "#64748b" }}>
                Original {Number(selected.line.baseQtyDeployed).toFixed(2)} base · remaining{" "}
                {selected.remaining.toFixed(2)} · bill-back was $
                {Number(selected.line.billBackAmount).toFixed(2)}
              </p>
            )}

            <label>
              <span>Base qty to return *</span>
              <input
                type="number"
                min="0"
                step="any"
                value={baseQty}
                onChange={(e) => setBaseQty(e.target.value)}
                required
              />
            </label>

            {error && (
              <p style={{ color: "#b91c1c", fontSize: "14px" }} role="alert">
                {error}
              </p>
            )}

            <div className="form-actions">
              <button type="button" className="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" disabled={loading}>
                {loading ? "Returning…" : "Confirm return"}
              </button>
            </div>
          </form>
        )}

        {!loadingList && options.length === 0 && (
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
