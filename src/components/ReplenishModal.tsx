import React, { useEffect, useMemo, useState } from "react";
import type { Client, Property, Sku, StockLocation } from "../types";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { skusApi } from "../services/catalogueApi";
import { replenishmentApi } from "../services/replenishmentApi";
import { propertySupplyItemsApi } from "../services/propertySupplyItemsApi";
import { effectiveMarkup, estimateBillBack, formatMoney } from "../utils/billBack";
import { StockFlowModal } from "./StockFlowModal";
import { Button, FormField, Icon } from "./ui";

type LineDraft = {
  id: string;
  skuId: string;
  baseQty: string;
};

type Props = {
  properties: Property[];
  clients?: Client[];
  /** When provided, skip refetching locations */
  stockLocations?: StockLocation[];
  initialPropertyId?: string;
  initialSupplyItemId?: string;
  onClose: () => void;
  onSuccess: () => void;
};

const newLine = (): LineDraft => ({
  id: crypto.randomUUID(),
  skuId: "",
  baseQty: "",
});

function packQtyPreview(baseQty: number, packSize: number): string {
  if (!(packSize > 0) || !(baseQty > 0)) return "—";
  return (baseQty / packSize).toFixed(6).replace(/\.?0+$/, "") || "0";
}

export const ReplenishModal: React.FC<Props> = ({
  properties,
  clients = [],
  stockLocations: stockLocationsProp,
  initialPropertyId,
  initialSupplyItemId,
  onClose,
  onSuccess,
}) => {
  const [propertyId, setPropertyId] = useState(initialPropertyId || "");
  const [stockLocationId, setStockLocationId] = useState("");
  const [locations, setLocations] = useState<StockLocation[]>(stockLocationsProp || []);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stockedSupplyItemIds, setStockedSupplyItemIds] = useState<Set<string>>(new Set());

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

  const linkedLocations = useMemo(() => {
    if (!propertyId) return [];
    return locations.filter((loc) =>
      (loc.properties || []).some((p) => p.propertyId === propertyId)
    );
  }, [locations, propertyId]);

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const billingClient = clients.find((c) => c.id === selectedProperty?.clientId);
  const markupInfo = useMemo(
    () => effectiveMarkup(selectedProperty, billingClient, clients),
    [selectedProperty, billingClient, clients]
  );

  const linkedLocationKey = linkedLocations.map((l) => l.id).join(",");

  useEffect(() => {
    setSkus([]);
    setLines([newLine()]);
    setStockLocationId("");
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    if (linkedLocations.length === 1) {
      setStockLocationId(linkedLocations[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures link set for this property
  }, [propertyId, linkedLocationKey]);

  useEffect(() => {
    if (!stockLocationId) {
      setSkus([]);
      return;
    }
    skusApi
      .getAll({ stockLocationId })
      .then(setSkus)
      .catch(() => setSkus([]));
  }, [stockLocationId]);

  useEffect(() => {
    if (!propertyId) {
      setStockedSupplyItemIds(new Set());
      return;
    }
    propertySupplyItemsApi
      .listByProperty(propertyId)
      .then((rows) => setStockedSupplyItemIds(new Set(rows.map((r) => r.supplyItemId))))
      .catch(() => setStockedSupplyItemIds(new Set()));
  }, [propertyId]);

  const estimatedTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const sku = skus.find((s) => s.id === line.skuId);
      const base = Number(line.baseQty) || 0;
      if (!sku || !(base > 0)) return sum;
      return sum + estimateBillBack(base, Number(sku.unitRate) || 0, markupInfo.pct);
    }, 0);
  }, [lines, skus, markupInfo.pct]);

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!propertyId || !stockLocationId) {
      setError("Select a property and linked stock location. Use Add new → Link if needed.");
      return;
    }
    if (!selectedProperty?.clientId) {
      setError("Property needs a billing client. Use Add new → Property (or Edit on the property tab).");
      return;
    }
    const payloadLines = lines
      .map((l) => ({
        skuId: l.skuId,
        baseQty: Number(l.baseQty),
      }))
      .filter((l) => l.skuId && l.baseQty > 0);
    if (payloadLines.length === 0) {
      setError("Add at least one SKU line with a base quantity.");
      return;
    }
    setLoading(true);
    try {
      await replenishmentApi.create({
        propertyId,
        stockLocationId,
        lines: payloadLines,
      });
      const newSupplyItemIds = new Set(
        payloadLines
          .map((l) => skus.find((s) => s.id === l.skuId)?.supplyItemId)
          .filter((sid): sid is string => Boolean(sid) && !stockedSupplyItemIds.has(sid!))
      );
      await Promise.all(
        Array.from(newSupplyItemIds).map((supplyItemId) =>
          propertySupplyItemsApi.upsert(propertyId, supplyItemId, { parQuantity: 0 }).catch(() => undefined)
        )
      );
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replenishment failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StockFlowModal
      title="Replenish property"
      error={error}
      loading={loading}
      maxWidth={640}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="inventory-form stacked-form">
        <div className="form-grid">
          {initialPropertyId ? (
            <div className="stock-flow-context">
              <span>Property</span>
              <strong>{selectedProperty?.name || "Selected property"}</strong>
            </div>
          ) : (
            <FormField label="Property" required>
              {(inputProps) => (
                <select
                  {...inputProps}
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  required
                >
                  <option value="">Select property…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {!p.clientId ? " (no billing client)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}
          <FormField label="Stock location" required>
            {(inputProps) => (
              <select
                {...inputProps}
                value={stockLocationId}
                onChange={(e) => setStockLocationId(e.target.value)}
                required
                disabled={!propertyId}
              >
                <option value="">
                  {!propertyId
                    ? "Select a property first"
                    : linkedLocations.length === 0
                      ? "No linked locations"
                      : "Select location…"}
                </option>
                {linkedLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>

        {selectedProperty && (
          <p className="stock-form-note">
            Markup: {markupInfo.label}
            {billingClient ? ` · Client ${billingClient.name}` : ""}
          </p>
        )}

        {selectedProperty && !selectedProperty.clientId && (
          <p className="form-banner stock-form-warning">
            Assign a billing client via Add new → Property before replenishing.
          </p>
        )}

        {selectedProperty && linkedLocations.length === 0 && (
          <p className="form-banner stock-form-warning">
            Link a stock location via Add new → Link location ↔ property.
          </p>
        )}

        <div className="stock-flow-section">
          <div className="stock-flow-section-header">
            <strong>Lines</strong>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines((prev) => [...prev, newLine()])}
              disabled={!stockLocationId}
            >
              Add line
            </Button>
          </div>
          {lines.map((line) => {
            const sku = skus.find((s) => s.id === line.skuId);
            const base = Number(line.baseQty) || 0;
            const packSize = sku ? Number(sku.packSize) : 0;
            const unitRate = sku ? Number(sku.unitRate) : 0;
            const onHand = sku?.stockOnHand ? Number(sku.stockOnHand.quantity) : null;
            const lineBill = estimateBillBack(base, unitRate, markupInfo.pct);
            return (
              <div key={line.id} className="stock-flow-line">
                <FormField label="SKU" className="stock-flow-line-field">
                  {(inputProps) => (
                    <select
                      {...inputProps}
                      value={line.skuId}
                      onChange={(e) => updateLine(line.id, { skuId: e.target.value })}
                      disabled={!stockLocationId}
                    >
                      <option value="">Select SKU…</option>
                      {skus
                        .filter((s) => !initialSupplyItemId || s.supplyItemId === initialSupplyItemId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.stockOnHand
                              ? ` (${Number(s.stockOnHand.quantity).toFixed(2)} packs)`
                              : ""}
                          </option>
                        ))}
                    </select>
                  )}
                </FormField>
                <FormField label="Base qty" className="stock-flow-line-qty">
                  {(inputProps) => (
                    <input
                      {...inputProps}
                      type="number"
                      min="0"
                      step="any"
                      value={line.baseQty}
                      onChange={(e) => updateLine(line.id, { baseQty: e.target.value })}
                    />
                  )}
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="stock-flow-remove-button"
                  onClick={() =>
                    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== line.id)))
                  }
                  disabled={lines.length <= 1}
                  aria-label="Remove line"
                >
                  <Icon name="close" size={16} />
                </Button>
                {sku && base > 0 && (
                  <div className="stock-flow-line-summary">
                    Packs used ≈ {packQtyPreview(base, packSize)}
                    {onHand != null ? ` · on hand ${onHand.toFixed(4)}` : ""}
                    {" · "}
                    Est. bill-back ${formatMoney(lineBill)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="stock-flow-total">
          Estimated bill-back total: ${formatMoney(estimatedTotal)}
        </p>

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Replenishing…" : "Confirm replenish"}
          </Button>
        </div>
      </form>
    </StockFlowModal>
  );
};
