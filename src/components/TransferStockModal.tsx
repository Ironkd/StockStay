import React, { useEffect, useMemo, useState } from "react";
import type { Client, Property, Sku, StockLocation } from "../types";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { skusApi } from "../services/catalogueApi";
import { replenishmentApi } from "../services/replenishmentApi";
import { effectiveMarkup, estimateBillBack, formatMoney } from "../utils/billBack";
import { StockFlowModal } from "./StockFlowModal";
import { Button, FormField } from "./ui";

type Props = {
  properties: Property[];
  clients?: Client[];
  stockLocations?: StockLocation[];
  onClose: () => void;
  onSuccess: () => void;
};

export const TransferStockModal: React.FC<Props> = ({
  properties,
  clients = [],
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
  const [availableBase, setAvailableBase] = useState<number | null>(null);
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
    setAvailableBase(null);
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

  useEffect(() => {
    if (!fromPropertyId || !selectedSku?.supplyItemId) {
      setAvailableBase(null);
      return;
    }
    let cancelled = false;
    replenishmentApi
      .listUnreverted(fromPropertyId, selectedSku.supplyItemId)
      .then((result) => {
        if (!cancelled) setAvailableBase(Number(result.totalRemaining) || 0);
      })
      .catch(() => {
        if (!cancelled) setAvailableBase(0);
      });
    return () => {
      cancelled = true;
    };
  }, [fromPropertyId, selectedSku?.supplyItemId]);

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
    if (availableBase != null && qty > availableBase + 1e-9) {
      setError(
        `Insufficient unreverted replenishment at source (available ${availableBase.toFixed(2)}).`
      );
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
      <form onSubmit={handleSubmit} className="inventory-form stacked-form">
        <div className="form-grid stock-modal-grid">
          <FormField label="From property" required>
            {(inputProps) => (
              <select
                {...inputProps}
                value={fromPropertyId}
                onChange={(e) => setFromPropertyId(e.target.value)}
                required
                disabled={loading}
              >
                <option value="">Select…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.clientId ? " (no client)" : ""}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="To property" required>
            {(inputProps) => (
              <select
                {...inputProps}
                value={toPropertyId}
                onChange={(e) => setToPropertyId(e.target.value)}
                required
                disabled={loading || !fromPropertyId}
              >
                <option value="">Select…</option>
                {toOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.clientId ? " (no client)" : ""}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Pass-through location" required>
            {(inputProps) => (
              <select
                {...inputProps}
                value={stockLocationId}
                onChange={(e) => setStockLocationId(e.target.value)}
                required
                disabled={loading || !fromPropertyId || !toPropertyId}
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
            )}
          </FormField>
          <FormField label="SKU" required>
            {(inputProps) => (
              <select
                {...inputProps}
                value={skuId}
                onChange={(e) => setSkuId(e.target.value)}
                required
                disabled={loading || !stockLocationId}
              >
                <option value="">Select SKU…</option>
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.supplyItem ? ` · ${s.supplyItem.name}` : ""}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Base qty to transfer" required>
            {(inputProps) => (
              <input
                {...inputProps}
                type="number"
                min="0"
                step="any"
                value={baseQty}
                onChange={(e) => setBaseQty(e.target.value)}
                required
                disabled={loading}
              />
            )}
          </FormField>
        </div>

        {selectedSku && availableBase != null ? (
          <p className="stock-form-note">
            Available to transfer (unreverted at source): {availableBase.toFixed(2)} base units
            {selectedSku.supplyItem ? ` (${selectedSku.supplyItem.name})` : ""}
          </p>
        ) : null}

        {qty > 0 && selectedSku ? (
          <div className="stock-form-note" aria-live="polite">
            <div>
              Est. credit (source): ${formatMoney(creditEst)} · {fromMarkup.label}
            </div>
            <div>
              Est. charge (destination): ${formatMoney(chargeEst)} · {toMarkup.label}
            </div>
          </div>
        ) : null}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Transferring…" : "Confirm transfer"}
          </Button>
        </div>
      </form>
    </StockFlowModal>
  );
};
