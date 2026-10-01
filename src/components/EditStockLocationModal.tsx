import React, { useEffect, useMemo, useState } from "react";
import type { Property, StockLocation, SupplyItem } from "../types";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { propertiesApi } from "../services/propertiesApi";
import { Button, FormField, Modal } from "./ui";

type Props = {
  location: StockLocation;
  supplyItems: SupplyItem[];
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export const EditStockLocationModal: React.FC<Props> = ({
  location,
  supplyItems,
  canWrite,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState(location.name);
  const [address, setAddress] = useState(location.address || "");
  const [showUncategorized, setShowUncategorized] = useState(
    location.showUncategorized !== false
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  /** True after Select all, or when location already includes future categories (null). */
  const [includeFutureCategories, setIncludeFutureCategories] = useState(
    location.visibleCategories == null
  );
  const [teamProperties, setTeamProperties] = useState<Property[]>([]);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [initialLinkedPropertyIds, setInitialLinkedPropertyIds] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const item of supplyItems) {
      const c = (item.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [supplyItems]);

  useEffect(() => {
    if (location.visibleCategories == null) {
      setSelectedCategories(new Set(availableCategories));
      setIncludeFutureCategories(true);
    } else {
      setSelectedCategories(new Set(location.visibleCategories));
      setIncludeFutureCategories(false);
    }
  }, [location.visibleCategories, availableCategories]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    propertiesApi
      .getAll()
      .then((props) => {
        if (cancelled) return;
        setTeamProperties(props);
        const linked = new Set((location.properties || []).map((p) => p.propertyId));
        setSelectedPropertyIds(new Set(linked));
        setInitialLinkedPropertyIds(new Set(linked));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load properties");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location.id, location.properties]);

  const linkedPropertiesSorted = useMemo(() => {
    const linked = teamProperties
      .filter((p) => initialLinkedPropertyIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const other = teamProperties
      .filter((p) => !initialLinkedPropertyIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return { linked, other };
  }, [teamProperties, initialLinkedPropertyIds]);

  const toggleCategory = (category: string) => {
    setIncludeFutureCategories(false);
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const selectAllCategories = () => {
    setSelectedCategories(new Set(availableCategories));
    setIncludeFutureCategories(true);
  };

  const deselectAllCategories = () => {
    setSelectedCategories(new Set());
    setIncludeFutureCategories(false);
  };

  const togglePropertySelection = (propertyId: string) => {
    setSelectedPropertyIds((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  };

  const selectAllProperties = () => {
    setSelectedPropertyIds(new Set(teamProperties.map((p) => p.id)));
  };

  const deselectAllProperties = () => {
    setSelectedPropertyIds(new Set());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    if (!name.trim()) {
      setError("Location name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const allSelected =
        availableCategories.length > 0 &&
        availableCategories.every((c) => selectedCategories.has(c));
      const visibleCategories =
        availableCategories.length === 0
          ? location.visibleCategories == null
            ? null
            : []
          : includeFutureCategories && allSelected
            ? null
            : availableCategories.filter((c) => selectedCategories.has(c));

      await stockLocationsApi.update(location.id, {
        name: name.trim(),
        address: address.trim() || null,
        visibleCategories,
        showUncategorized,
      });

      const current = initialLinkedPropertyIds;
      const next = selectedPropertyIds;
      const toLink = [...next].filter((id) => !current.has(id));
      const toUnlink = [...current].filter((id) => !next.has(id));
      await Promise.all([
        ...toLink.map((propertyId) => stockLocationsApi.linkProperty(location.id, propertyId)),
        ...toUnlink.map((propertyId) =>
          stockLocationsApi.unlinkProperty(location.id, propertyId)
        ),
      ]);

      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save stock location");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit stock location" maxWidth="560px" busy={busy}>
      <p className="modal-intro">
        Update address, which categories appear here, and linked properties.
      </p>

      <form className="inventory-form stacked-form" onSubmit={handleSave}>
        <div>
          <div className="checklist-group-heading">Details</div>
          <div className="form-grid stock-modal-grid">
            <FormField label="Name" required>
              {(inputProps) => (
                <input
                  {...inputProps}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={busy || !canWrite}
                />
              )}
            </FormField>
            <FormField label="Address">
              {(inputProps) => (
                <input
                  {...inputProps}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Optional"
                  disabled={busy || !canWrite}
                />
              )}
            </FormField>
          </div>
        </div>

        <div>
          <div className="checklist-group-heading">Visible categories</div>
          <p className="stock-form-note">
            Choose which supply-item categories appear on this location’s On hand and Catalogue
            tabs.
          </p>
          <div className="checklist-box">
            <label className="checklist-row">
              <input
                type="checkbox"
                className="checklist-checkbox"
                checked={showUncategorized}
                onChange={(e) => setShowUncategorized(e.target.checked)}
                disabled={busy || !canWrite}
              />
              <span className="checklist-label">Uncategorized Items</span>
            </label>
            {availableCategories.length === 0 ? (
              <p className="stock-form-note">
                No named categories yet. Add categories on supply items to filter by them here.
              </p>
            ) : (
              availableCategories.map((category) => (
                <label key={category} className="checklist-row">
                  <input
                    type="checkbox"
                    className="checklist-checkbox"
                    checked={selectedCategories.has(category)}
                    onChange={() => toggleCategory(category)}
                    disabled={busy || !canWrite}
                  />
                  <span className="checklist-label">{category}</span>
                </label>
              ))
            )}
          </div>
          {canWrite && availableCategories.length > 0 ? (
            <div className="checklist-bulk-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={selectAllCategories}
                disabled={busy}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={deselectAllCategories}
                disabled={busy || selectedCategories.size === 0}
              >
                Deselect all
              </Button>
            </div>
          ) : null}
        </div>

        <div>
          <div className="checklist-group-heading">Linked properties</div>
          <p className="stock-form-note">
            {canWrite
              ? "Choose which properties this stock location can supply."
              : "Properties this stock location can supply."}
          </p>
          {loading ? (
            <p className="stock-form-note">Loading properties…</p>
          ) : teamProperties.length === 0 ? (
            <p className="stock-form-note">
              No properties yet. Add properties from the Properties page.
            </p>
          ) : (
            <>
              <div className="checklist-box checklist-box--tall">
                <div className="stacked-form">
                  {linkedPropertiesSorted.linked.length > 0 ? (
                    <div>
                      <div className="checklist-group-heading">Currently linked</div>
                      {linkedPropertiesSorted.linked.map((p) => (
                        <label key={p.id} className="checklist-row">
                          <input
                            type="checkbox"
                            className="checklist-checkbox"
                            checked={selectedPropertyIds.has(p.id)}
                            onChange={() => togglePropertySelection(p.id)}
                            disabled={busy || !canWrite}
                          />
                          <span className="checklist-label">
                            {p.name}
                            {p.location ? (
                              <span className="checklist-label-meta"> · {p.location}</span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {linkedPropertiesSorted.other.length > 0 ? (
                    <div>
                      <div className="checklist-group-heading">
                        {linkedPropertiesSorted.linked.length > 0
                          ? "Other properties"
                          : "Properties"}
                      </div>
                      {linkedPropertiesSorted.other.map((p) => (
                        <label key={p.id} className="checklist-row">
                          <input
                            type="checkbox"
                            className="checklist-checkbox"
                            checked={selectedPropertyIds.has(p.id)}
                            onChange={() => togglePropertySelection(p.id)}
                            disabled={busy || !canWrite}
                          />
                          <span className="checklist-label">
                            {p.name}
                            {p.location ? (
                              <span className="checklist-label-meta"> · {p.location}</span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              {canWrite ? (
                <div className="checklist-bulk-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={selectAllProperties}
                    disabled={busy}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={deselectAllProperties}
                    disabled={busy || selectedPropertyIds.size === 0}
                  >
                    Deselect all
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        {error ? (
          <p className="form-banner error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {canWrite ? "Cancel" : "Close"}
          </Button>
          {canWrite ? (
            <Button type="submit" disabled={busy || loading}>
              {busy ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
};
