import React, { useEffect, useMemo, useState } from "react";
import type { Sku, SupplyItem, UnitOfMeasure } from "../types";
import { skusApi } from "../services/catalogueApi";
import { formatQty as formatQtyShared } from "../utils/format";
import { Button, EmptyState, FormField, Modal } from "./ui";

function formatQty(n: number): string {
  return formatQtyShared(n, 4);
}

type SkuDraft = {
  id?: string;
  name: string;
  packSize: string;
  purchasePrice: string;
  supplier: string;
};

type Props = {
  supplyItem: SupplyItem;
  units: UnitOfMeasure[];
  locationId?: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export const ManageSupplyItemSkusModal: React.FC<Props> = ({
  supplyItem,
  units,
  locationId,
  onClose,
  onSaved,
}) => {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSku, setEditingSku] = useState<SkuDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const baseUnitLabel =
    units.find((unit) => unit.id === supplyItem.baseUnitId)?.code ||
    supplyItem.baseUnit?.code ||
    "units";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        if (!cancelled) setLoading(false);
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
    setEditingSku({ name: "", packSize: "", purchasePrice: "", supplier: "" });
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
        setSkus((prev) => prev.map((sku) => (sku.id === updated.id ? updated : sku)));
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
      setSkus((prev) => prev.filter((item) => item.id !== sku.id));
      if (editingSku?.id === sku.id) setEditingSku(null);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive SKU");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Manage SKUs · ${supplyItem.name}`}
      maxWidth="720px"
      busy={busy}
    >
      {editingSku ? (
        <form className="inventory-form stacked-form" onSubmit={handleSaveSku}>
          <div className="checklist-group-heading">
            {editingSku.id ? "Edit SKU" : "Add SKU"}
          </div>
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
          {error ? (
            <p className="form-banner error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingSku(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editingSku.id ? "Update SKU" : "Add SKU"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="form-actions">
            <Button type="button" onClick={openNewSku} disabled={busy}>
              Add SKU
            </Button>
          </div>
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
          {loading ? (
            <p className="stock-form-note">Loading SKUs…</p>
          ) : sortedSkus.length === 0 ? (
            <EmptyState title="No SKUs yet" />
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
        </>
      )}
    </Modal>
  );
};
