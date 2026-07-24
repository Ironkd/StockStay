import React, { useEffect, useMemo, useState } from "react";
import type { Client, Property, Sku, StockLocation } from "../types";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { skusApi } from "../services/catalogueApi";
import { replenishmentApi } from "../services/replenishmentApi";

type LineDraft = {
  id: string;
  skuId: string;
  baseQty: string;
};

type Props = {
  properties: Property[];
  clients?: Client[];
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

function billBackAmount(baseQty: number, unitRate: number, markup: number): number {
  if (!(baseQty > 0)) return 0;
  return baseQty * unitRate * (1 + markup / 100);
}

export const ReplenishModal: React.FC<Props> = ({
  properties,
  clients = [],
  onClose,
  onSuccess,
}) => {
  const [propertyId, setPropertyId] = useState("");
  const [stockLocationId, setStockLocationId] = useState("");
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    stockLocationsApi
      .getAll()
      .then(setLocations)
      .catch(() => setLocations([]));
  }, []);

  const linkedLocations = useMemo(() => {
    if (!propertyId) return [];
    return locations.filter((loc) =>
      (loc.properties || []).some((p) => p.propertyId === propertyId)
    );
  }, [locations, propertyId]);

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const billingClient = clients.find((c) => c.id === selectedProperty?.clientId);

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

  const markupInfo = useMemo(() => {
    if (!selectedProperty) {
      return { pct: 0, label: "No markup" };
    }
    if (
      selectedProperty.markupPercentage != null &&
      selectedProperty.markupPercentage !== ""
    ) {
      const pct = Number(selectedProperty.markupPercentage) || 0;
      return { pct, label: `Property override ${pct}%` };
    }
    if (billingClient) {
      const pct = Number(billingClient.defaultMarkupPercentage ?? 0) || 0;
      return { pct, label: pct ? `Client default ${pct}%` : "Client default 0%" };
    }
    return { pct: 0, label: "No markup" };
  }, [selectedProperty, billingClient]);

  const estimatedTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const sku = skus.find((s) => s.id === line.skuId);
      const base = Number(line.baseQty) || 0;
      if (!sku || !(base > 0)) return sum;
      return sum + billBackAmount(base, Number(sku.unitRate) || 0, markupInfo.pct);
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
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replenishment failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "640px", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0 }}>Replenish property</h3>
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p style={{ marginTop: 0, color: "#64748b", fontSize: "14px" }}>
          Move stock from a linked stock location to a property. Bill-back is queued as an unbilled charge.
        </p>
        <form onSubmit={handleSubmit} className="inventory-form">
          <div className="form-grid">
            <label>
              <span>Property *</span>
              <select
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
            </label>
            <label>
              <span>Stock location *</span>
              <select
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
            </label>
          </div>

          {selectedProperty && (
            <p style={{ fontSize: "13px", color: "#64748b", marginTop: "8px" }}>
              Markup: {markupInfo.label}
              {billingClient ? ` · Client ${billingClient.name}` : ""}
            </p>
          )}

          {selectedProperty && !selectedProperty.clientId && (
            <p style={{ color: "#b45309", fontSize: "13px" }}>
              Assign a billing client via Add new → Property before replenishing.
            </p>
          )}

          {selectedProperty && linkedLocations.length === 0 && (
            <p style={{ color: "#b45309", fontSize: "13px" }}>
              Link a stock location via Add new → Link location ↔ property.
            </p>
          )}

          <div style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong>Lines</strong>
              <button
                type="button"
                className="secondary"
                onClick={() => setLines((prev) => [...prev, newLine()])}
                disabled={!stockLocationId}
              >
                Add line
              </button>
            </div>
            {lines.map((line) => {
              const sku = skus.find((s) => s.id === line.skuId);
              const base = Number(line.baseQty) || 0;
              const packSize = sku ? Number(sku.packSize) : 0;
              const unitRate = sku ? Number(sku.unitRate) : 0;
              const onHand = sku?.stockOnHand ? Number(sku.stockOnHand.quantity) : null;
              const lineBill = billBackAmount(base, unitRate, markupInfo.pct);
              return (
                <div
                  key={line.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 100px auto",
                    gap: "8px",
                    marginBottom: "10px",
                    alignItems: "end",
                  }}
                >
                  <label style={{ margin: 0 }}>
                    <span>SKU</span>
                    <select
                      value={line.skuId}
                      onChange={(e) => updateLine(line.id, { skuId: e.target.value })}
                      disabled={!stockLocationId}
                    >
                      <option value="">Select SKU…</option>
                      {skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.stockOnHand
                            ? ` (${Number(s.stockOnHand.quantity).toFixed(2)} packs)`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ margin: 0 }}>
                    <span>Base qty</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.baseQty}
                      onChange={(e) => updateLine(line.id, { baseQty: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() =>
                      setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== line.id)))
                    }
                    disabled={lines.length <= 1}
                    aria-label="Remove line"
                  >
                    ✕
                  </button>
                  {sku && base > 0 && (
                    <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "#64748b" }}>
                      Packs used ≈ {packQtyPreview(base, packSize)}
                      {onHand != null ? ` · on hand ${onHand.toFixed(4)}` : ""}
                      {" · "}
                      Est. bill-back ${lineBill.toFixed(2)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p style={{ fontWeight: 600, marginTop: "12px" }}>
            Estimated bill-back total: ${estimatedTotal.toFixed(2)}
          </p>

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
              {loading ? "Replenishing…" : "Confirm replenish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
