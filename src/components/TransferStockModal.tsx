import React, { useEffect, useMemo, useState } from "react";
import type { Client, Property, PropertyStock, Sku, StockLocation } from "../types";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { skusApi } from "../services/catalogueApi";
import { replenishmentApi } from "../services/replenishmentApi";

type Props = {
  properties: Property[];
  clients?: Client[];
  propertyStocks: PropertyStock[];
  onClose: () => void;
  onSuccess: () => void;
};

function markupPct(property: Property | undefined, clients: Client[]): { pct: number; label: string } {
  if (!property) return { pct: 0, label: "—" };
  if (property.markupPercentage != null && property.markupPercentage !== "") {
    const pct = Number(property.markupPercentage) || 0;
    return { pct, label: `Property override ${pct}%` };
  }
  const client = clients.find((c) => c.id === property.clientId);
  const pct = Number(client?.defaultMarkupPercentage ?? 0) || 0;
  return { pct, label: client ? `Client default ${pct}%` : "No markup" };
}

function billAmount(baseQty: number, unitRate: number, markup: number, credit: boolean): number {
  if (!(baseQty > 0)) return 0;
  const amt = baseQty * unitRate * (1 + markup / 100);
  return credit ? -amt : amt;
}

export const TransferStockModal: React.FC<Props> = ({
  properties,
  clients = [],
  propertyStocks,
  onClose,
  onSuccess,
}) => {
  const [fromPropertyId, setFromPropertyId] = useState("");
  const [toPropertyId, setToPropertyId] = useState("");
  const [stockLocationId, setStockLocationId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [baseQty, setBaseQty] = useState("");
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    stockLocationsApi
      .getAll()
      .then(setLocations)
      .catch(() => setLocations([]));
  }, []);

  const fromProperty = properties.find((p) => p.id === fromPropertyId);
  const toProperty = properties.find((p) => p.id === toPropertyId);
  const fromMarkup = markupPct(fromProperty, clients);
  const toMarkup = markupPct(toProperty, clients);

  const sharedLocations = useMemo(() => {
    if (!fromPropertyId || !toPropertyId) return [];
    return locations.filter((loc) => {
      const links = loc.properties || [];
      const hasFrom = links.some((p) => p.propertyId === fromPropertyId);
      const hasTo = links.some((p) => p.propertyId === toPropertyId);
      return hasFrom && hasTo;
    });
  }, [locations, fromPropertyId, toPropertyId]);

  const sharedKey = sharedLocations.map((l) => l.id).join(",");

  useEffect(() => {
    setStockLocationId("");
    setSkuId("");
    setSkus([]);
  }, [fromPropertyId, toPropertyId]);

  useEffect(() => {
    if (sharedLocations.length === 1) {
      setStockLocationId(sharedLocations[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromPropertyId, toPropertyId, sharedKey]);

  useEffect(() => {
    if (!stockLocationId) {
      setSkus([]);
      setSkuId("");
      return;
    }
    skusApi
      .getAll({ stockLocationId })
      .then(setSkus)
      .catch(() => setSkus([]));
  }, [stockLocationId]);

  const selectedSku = skus.find((s) => s.id === skuId);
  const availablePropertyStock = useMemo(() => {
    if (!fromPropertyId || !selectedSku) return null;
    const row = propertyStocks.find(
      (ps) => ps.propertyId === fromPropertyId && ps.supplyItemId === selectedSku.supplyItemId
    );
    return row ? Number(row.quantity) : 0;
  }, [fromPropertyId, selectedSku, propertyStocks]);

  const qty = Number(baseQty) || 0;
  const unitRate = selectedSku ? Number(selectedSku.unitRate) || 0 : 0;
  const creditEst = billAmount(qty, unitRate, fromMarkup.pct, true);
  const chargeEst = billAmount(qty, unitRate, toMarkup.pct, false);

  const toOptions = properties.filter((p) => p.id !== fromPropertyId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!fromPropertyId || !toPropertyId || !stockLocationId || !skuId) {
      setError("Select source, destination, pass-through location, and SKU.");
      return;
    }
    if (!(qty > 0)) {
      setError("Enter a base quantity greater than zero.");
      return;
    }
    if (!fromProperty?.clientId || !toProperty?.clientId) {
      setError("Both properties need a billing client.");
      return;
    }
    if (availablePropertyStock != null && qty > availablePropertyStock + 1e-9) {
      setError(`Insufficient property stock (available ${availablePropertyStock.toFixed(2)}).`);
      return;
    }
    setLoading(true);
    try {
      await replenishmentApi.createTransfer({
        fromPropertyId,
        toPropertyId,
        stockLocationId,
        skuId,
        baseQty: qty,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed.");
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
          <h3 style={{ margin: 0 }}>Transfer between properties</h3>
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p style={{ marginTop: 0, color: "#64748b", fontSize: "14px" }}>
          Pass-through a stock location: return from source (credit) then replenish destination (charge).
          Both legs queue to unbilled / next invoice.
        </p>

        <form onSubmit={handleSubmit} className="inventory-form">
          <div className="form-grid">
            <label>
              <span>From property *</span>
              <select value={fromPropertyId} onChange={(e) => setFromPropertyId(e.target.value)} required>
                <option value="">Select…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.clientId ? " (no client)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>To property *</span>
              <select
                value={toPropertyId}
                onChange={(e) => setToPropertyId(e.target.value)}
                required
                disabled={!fromPropertyId}
              >
                <option value="">Select…</option>
                {toOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.clientId ? " (no client)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Pass-through location *</span>
              <select
                value={stockLocationId}
                onChange={(e) => setStockLocationId(e.target.value)}
                required
                disabled={!fromPropertyId || !toPropertyId}
              >
                <option value="">
                  {!fromPropertyId || !toPropertyId
                    ? "Select both properties first"
                    : sharedLocations.length === 0
                      ? "No shared linked locations"
                      : "Select…"}
                </option>
                {sharedLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>SKU *</span>
              <select
                value={skuId}
                onChange={(e) => setSkuId(e.target.value)}
                required
                disabled={!stockLocationId}
              >
                <option value="">Select SKU…</option>
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.supplyItem ? ` · ${s.supplyItem.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedSku && availablePropertyStock != null && (
            <p style={{ fontSize: "13px", color: "#64748b" }}>
              Available at source: {availablePropertyStock.toFixed(2)} base units
              {selectedSku.supplyItem ? ` (${selectedSku.supplyItem.name})` : ""}
            </p>
          )}

          {fromPropertyId && toPropertyId && sharedLocations.length === 0 && (
            <p style={{ color: "#b45309", fontSize: "13px" }}>
              Link both properties to the same stock location (Add new → Link).
            </p>
          )}

          <label>
            <span>Base qty *</span>
            <input
              type="number"
              min="0"
              step="any"
              value={baseQty}
              onChange={(e) => setBaseQty(e.target.value)}
              required
            />
          </label>

          {qty > 0 && selectedSku && (
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "8px" }}>
              <div>
                Est. credit (source): ${creditEst.toFixed(2)} · {fromMarkup.label}
              </div>
              <div>
                Est. charge (destination): ${chargeEst.toFixed(2)} · {toMarkup.label}
              </div>
            </div>
          )}

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
              {loading ? "Transferring…" : "Confirm transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
