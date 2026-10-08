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
import { Button, EmptyState, FormField, Modal } from "./ui";

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
    <Modal open onClose={onClose} title="Edit supply item" maxWidth="560px" busy={busy}>

      <form className="inventory-form stacked-form" onSubmit={handleSave}>
        <div>
          <div className="checklist-group-heading">Properties</div>
          <div className="form-grid stock-modal-grid">
            <FormField label="Name" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={busy}
                />
              )}
            </FormField>
            <FormField label="Category">
              {(inputProps) => (
                <input
                  {...inputProps}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Optional"
                  disabled={busy}
                />
              )}
            </FormField>
            <FormField label="Base unit" required>
              {(inputProps) => (
                <select
                  {...inputProps}
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
              )}
            </FormField>
          </div>
        </div>

        {locationId ? (
          <div>
            <div className="checklist-group-heading">
              Reorder at {locationName || "this location"}
            </div>
            <div className="form-grid stock-modal-grid">
              <FormField label="Reorder point">
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="number"
                    min="0"
                    step="any"
                    value={reorderPoint}
                    onChange={(e) => setReorderPoint(e.target.value)}
                    placeholder="0"
                    disabled={busy}
                  />
                )}
              </FormField>
              <FormField label="Suggested buy qty">
                {(inputProps) => (
                  <input
                    {...inputProps}
                    type="number"
                    min="0"
                    step="any"
                    value={reorderQuantity}
                    onChange={(e) => setReorderQuantity(e.target.value)}
                    placeholder="0"
                    disabled={busy}
                  />
                )}
              </FormField>
            </div>
          </div>
        ) : null}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save supply item"}
          </Button>
        </div>
      </form>

      <div className="checklist-group-heading">SKUs</div>
      {!editingSku ? (
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={openNewSku} disabled={busy}>
            Add SKU
          </Button>
        </div>
      ) : null}

      {editingSku ? (
        <form className="inventory-form stacked-form" onSubmit={handleSaveSku}>
          <div className="form-grid stock-modal-grid">
            <FormField label="Name" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  value={editingSku.name}
                  onChange={(e) => setEditingSku({ ...editingSku, name: e.target.value })}
                  required
                  disabled={busy}
                />
              )}
            </FormField>
            <FormField label={`Pack size (${baseUnitLabel})`} required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  type="number"
                  min="0"
                  step="any"
                  value={editingSku.packSize}
                  onChange={(e) => setEditingSku({ ...editingSku, packSize: e.target.value })}
                  required
                  disabled={busy}
                />
              )}
            </FormField>
            <FormField label="Purchase price" required>
              {(inputProps) => (
                <input
                  {...inputProps}
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
              )}
            </FormField>
            <FormField label="Supplier">
              {(inputProps) => (
                <input
                  {...inputProps}
                  value={editingSku.supplier}
                  onChange={(e) => setEditingSku({ ...editingSku, supplier: e.target.value })}
                  placeholder="Optional"
                  disabled={busy}
                />
              )}
            </FormField>
          </div>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setEditingSku(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editingSku.id ? "Update SKU" : "Add SKU"}
            </Button>
          </div>
        </form>
      ) : null}

      {loadingSkus ? (
        <p className="stock-form-note">Loading SKUs…</p>
      ) : sortedSkus.length === 0 ? (
        <EmptyState
          title="No SKUs yet"
        />
      ) : (
        <table className="inventory-table">
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
                    <div className="checklist-label-meta">{sku.supplier}</div>
                  ) : null}
                </td>
                <td>
                  {formatQty(Number(sku.packSize))} {baseUnitLabel}
                </td>
                <td>${Number(sku.purchasePrice).toFixed(2)}</td>
                <td>
                  <div className="section-header-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => openEditSku(sku)}
                      disabled={busy}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleArchiveSku(sku)}
                      disabled={busy}
                    >
                      Archive
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {units.length === 0 ? (
        <p className="form-banner stock-form-warning">
          No units of measure found. Run database migrations so seeded units (ea, pack, …) are
          available.
        </p>
      ) : null}

      {error ? (
        <p className="form-banner error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
};
