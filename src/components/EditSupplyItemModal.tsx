import React, { useEffect, useMemo, useState } from "react";
import type {
  LocationSupplyThreshold,
  Sku,
  SupplyItem,
  UnitOfMeasure,
} from "../types";
import {
  locationSupplyThresholdsApi,
  skusApi,
  supplyItemsApi,
} from "../services/catalogueApi";
import { formatQty as formatQtyShared } from "../utils/format";

function formatQty(n: number): string {
  return formatQtyShared(n, 4);
}

type Props = {
  supplyItem: SupplyItem;
  units: UnitOfMeasure[];
  /** When set, show and save location-specific reorder thresholds. */
  locationId?: string | null;
  locationName?: string | null;
  existingThreshold?: LocationSupplyThreshold | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

type SkuDraft = {
  id?: string;
  name: string;
  packSize: string;
  purchasePrice: string;
  supplier: string;
};

export const EditSupplyItemModal: React.FC<Props> = ({
  supplyItem,
  units,
  locationId,
  locationName,
  existingThreshold,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState(supplyItem.name);
  const [category, setCategory] = useState(supplyItem.category || "");
  const [baseUnitId, setBaseUnitId] = useState(supplyItem.baseUnitId);
  const [reorderPoint, setReorderPoint] = useState(
    existingThreshold ? String(Number(existingThreshold.reorderPoint)) : ""
  );
  const [reorderQuantity, setReorderQuantity] = useState(
    existingThreshold ? String(Number(existingThreshold.reorderQuantity)) : ""
  );
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(true);
  const [editingSku, setEditingSku] = useState<SkuDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const baseUnitLabel =
    units.find((u) => u.id === baseUnitId)?.code ||
    supplyItem.baseUnit?.code ||
    "units";

  useEffect(() => {
    let cancelled = false;
    setLoadingSkus(true);
    skusApi
      .getAll({ supplyItemId: supplyItem.id })
      .then((rows) => {
        if (!cancelled) setSkus(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load SKUs");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSkus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supplyItem.id]);

  const sortedSkus = useMemo(
    () =>
      [...skus].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [skus]
  );

  const openNewSku = () => {
    setError("");
    setEditingSku({
      name: "",
      packSize: "",
      purchasePrice: "",
      supplier: "",
    });
  };

  const openEditSku = (sku: Sku) => {
    setError("");
    setEditingSku({
      id: sku.id,
      name: sku.name,
      packSize: String(Number(sku.packSize)),
      purchasePrice: String(Number(sku.purchasePrice)),
      supplier: sku.supplier || "",
    });
  };

  const handleSaveSku = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSku) return;
    if (!editingSku.name.trim()) {
      setError("SKU name is required.");
      return;
    }
    const packSize = Number(editingSku.packSize);
    const purchasePrice = Number(editingSku.purchasePrice);
    if (!(packSize > 0)) {
      setError("Pack size must be greater than zero.");
      return;
    }
    if (!(purchasePrice >= 0) || Number.isNaN(purchasePrice)) {
      setError("Purchase price must be zero or greater.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editingSku.id) {
        const updated = await skusApi.update(editingSku.id, {
          name: editingSku.name.trim(),
          packSize,
          purchasePrice,
          supplier: editingSku.supplier.trim() || null,
        });
        setSkus((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      } else {
        const created = await skusApi.create({
          name: editingSku.name.trim(),
          supplyItemId: supplyItem.id,
          stockLocationId: locationId || undefined,
          packSize,
          purchasePrice,
          supplier: editingSku.supplier.trim() || null,
        });
        setSkus((prev) => [...prev, created]);
      }
      setEditingSku(null);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save SKU");
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveSku = async (sku: Sku) => {
    if (!window.confirm(`Archive SKU “${sku.name}”? It will be hidden from the catalogue.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await skusApi.update(sku.id, { archived: true });
      setSkus((prev) => prev.filter((s) => s.id !== sku.id));
      if (editingSku?.id === sku.id) setEditingSku(null);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive SKU");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Supply item name is required.");
      return;
    }
    if (!baseUnitId) {
      setError("Select a base unit.");
      return;
    }
    if (locationId) {
      const point = Number(reorderPoint === "" ? 0 : reorderPoint);
      const qty = Number(reorderQuantity === "" ? 0 : reorderQuantity);
      if (!Number.isFinite(point) || point < 0) {
        setError("Reorder point must be zero or greater.");
        return;
      }
      if (!Number.isFinite(qty) || qty < 0) {
        setError("Suggested buy qty must be zero or greater.");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      await supplyItemsApi.update(supplyItem.id, {
        name: name.trim(),
        category: category.trim() || undefined,
        baseUnitId,
      });
      if (locationId) {
        const point = Number(reorderPoint === "" ? 0 : reorderPoint);
        const qty = Number(reorderQuantity === "" ? 0 : reorderQuantity);
        await locationSupplyThresholdsApi.upsert(locationId, {
          supplyItemId: supplyItem.id,
          reorderPoint: point,
          reorderQuantity: qty,
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save supply item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <h3 style={{ marginTop: 0 }}>Edit supply item</h3>
        <p style={{ marginTop: 0, color: "#64748b", fontSize: "13px" }}>
          Update properties{locationId ? ", reorder for this location," : ""} and manage SKUs.
        </p>

        <form className="inventory-form" onSubmit={handleSave}>
          <h4 style={{ margin: "8px 0 0", fontSize: "14px" }}>Properties</h4>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>
              <span>Name *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label>
              <span>Category</span>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Optional"
                disabled={busy}
              />
            </label>
            <label>
              <span>Base unit *</span>
              <select
                value={baseUnitId}
                onChange={(e) => setBaseUnitId(e.target.value)}
                required
                disabled={busy || units.length === 0}
              >
                <option value="">Select…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {locationId ? (
            <>
              <h4 style={{ margin: "12px 0 0", fontSize: "14px" }}>
                Reorder at {locationName || "this location"}
              </h4>
              <p style={{ margin: 0, color: "#64748b", fontSize: "12px" }}>
                Thresholds are in {baseUnitLabel}. Set reorder point to 0 to turn alerts off.
              </p>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <label>
                  <span>Reorder point</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={reorderPoint}
                    onChange={(e) => setReorderPoint(e.target.value)}
                    placeholder="0"
                    disabled={busy}
                  />
                </label>
                <label>
                  <span>Suggested buy qty</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={reorderQuantity}
                    onChange={(e) => setReorderQuantity(e.target.value)}
                    placeholder="0"
                    disabled={busy}
                  />
                </label>
              </div>
            </>
          ) : (
            <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "12px" }}>
              Reorder thresholds are set per stock location. Open a location to configure them.
            </p>
          )}

          <div className="form-actions" style={{ marginTop: "8px" }}>
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save supply item"}
            </button>
          </div>
        </form>

        <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "20px 0" }} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <h4 style={{ margin: 0, fontSize: "14px" }}>SKUs</h4>
          {!editingSku && (
            <button type="button" className="secondary" onClick={openNewSku} disabled={busy}>
              Add SKU
            </button>
          )}
        </div>

        {editingSku && (
          <form
            className="inventory-form"
            onSubmit={handleSaveSku}
            style={{
              marginBottom: "12px",
              padding: "12px",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              background: "#f8fafc",
            }}
          >
            <h4 style={{ margin: "0 0 8px", fontSize: "13px" }}>
              {editingSku.id ? "Edit SKU" : "New SKU"}
            </h4>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label>
                <span>Name *</span>
                <input
                  value={editingSku.name}
                  onChange={(e) => setEditingSku({ ...editingSku, name: e.target.value })}
                  required
                  disabled={busy}
                />
              </label>
              <label>
                <span>Pack size ({baseUnitLabel}) *</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editingSku.packSize}
                  onChange={(e) => setEditingSku({ ...editingSku, packSize: e.target.value })}
                  required
                  disabled={busy}
                />
              </label>
              <label>
                <span>Purchase price *</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editingSku.purchasePrice}
                  onChange={(e) =>
                    setEditingSku({ ...editingSku, purchasePrice: e.target.value })
                  }
                  required
                  disabled={busy}
                />
              </label>
              <label>
                <span>Supplier</span>
                <input
                  value={editingSku.supplier}
                  onChange={(e) => setEditingSku({ ...editingSku, supplier: e.target.value })}
                  placeholder="Optional"
                  disabled={busy}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingSku(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "Saving…" : editingSku.id ? "Update SKU" : "Add SKU"}
              </button>
            </div>
          </form>
        )}

        {loadingSkus ? (
          <p style={{ color: "#64748b", fontSize: "13px" }}>Loading SKUs…</p>
        ) : sortedSkus.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "13px" }}>
            No SKUs yet. Add a purchasable pack size for this supply item.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="inventory-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Pack size</th>
                  <th>Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedSkus.map((sku) => (
                  <tr key={sku.id}>
                    <td>
                      {sku.name}
                      {sku.supplier ? (
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>{sku.supplier}</div>
                      ) : null}
                    </td>
                    <td>
                      {formatQty(Number(sku.packSize))} {baseUnitLabel}
                    </td>
                    <td>${Number(sku.purchasePrice).toFixed(2)}</td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => openEditSku(sku)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void handleArchiveSku(sku)}
                          disabled={busy}
                        >
                          Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error ? (
          <p style={{ color: "#b91c1c", fontSize: "14px", marginTop: "12px" }}>{error}</p>
        ) : null}
      </div>
    </div>
  );
};
