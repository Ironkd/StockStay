import React, { useEffect, useMemo, useState } from "react";
import type { Client, Property, PropertyStock, Sku, StockLocation } from "../types";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { skusApi } from "../services/catalogueApi";
import { replenishmentApi } from "../services/replenishmentApi";
import { effectiveMarkup, estimateBillBack, formatMoney } from "../utils/billBack";
import { StockFlowModal } from "./StockFlowModal";

type Props = {
  properties: Property[];
  clients?: Client[];
  propertyStocks: PropertyStock[];
  stockLocations?: StockLocation[];
  onClose: () => void;
  onSuccess: () => void;
};

export const TransferStockModal: React.FC<Props> = ({
  properties,
  clients = [],
  propertyStocks,
  stockLocations: stockLocationsProp,
  onClose,
  onSuccess,
}) => {
  const [fromPropertyId, setFromPropertyId] = useState("");
  const [toPropertyId, setToPropertyId] = useState("");
  const [stockLocationId, setStockLocationId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [baseQty, setBaseQty] = useState("");
  const [locations, setLocations] = useState<StockLocation[]>(stockLocationsProp || []);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (stockLocationsProp) {
      setLocations(stockLocationsProp);
      return;
    }
    stockLocationsApi
      .getAll()
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [stockLocationsProp]);

  const fromProperty = properties.find((p) => p.id === fromPropertyId);
  const toProperty = properties.find((p) => p.id === toPropertyId);
  const fromMarkup = useMemo(
    () => effectiveMarkup(fromProperty, null, clients),
    [fromProperty, clients]
  );
  const toMarkup = useMemo(
    () => effectiveMarkup(toProperty, null, clients),
    [toProperty, clients]
  );

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
  const creditEst = estimateBillBack(qty, unitRate, fromMarkup.pct, { credit: true });
  const chargeEst = estimateBillBack(qty, unitRate, toMarkup.pct);

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
    <StockFlowModal
      title="Transfer between properties"
      subtitle="Pass-through a stock location: return from source (credit) then replenish destination (charge). Both legs queue to unbilled / next invoice."
      error={error}
      loading={loading}
      onClose={onClose}
    >
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
              Est. credit (source): ${formatMoney(creditEst)} · {fromMarkup.label}
            </div>
            <div>
              Est. charge (destination): ${formatMoney(chargeEst)} · {toMarkup.label}
            </div>
          </div>
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
    </StockFlowModal>
  );
};
