import React, { useState } from "react";
import type {
  LocationSupplyThreshold,
  SupplyItem,
  UnitOfMeasure,
} from "../types";
import {
  locationSupplyThresholdsApi,
  supplyItemsApi,
} from "../services/catalogueApi";
import { Button, FormField, Modal } from "./ui";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save supply item"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
