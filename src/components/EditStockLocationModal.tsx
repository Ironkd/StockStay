import React, { useEffect, useMemo, useState } from "react";
import type { Property, StockLocation, SupplyItem } from "../types";
import { stockLocationsApi } from "../services/stockLocationsApi";
import { propertiesApi } from "../services/propertiesApi";

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
    // Initialize category selection: null = all checked (include future)
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
      // Only null (= include future categories) when already null, or user used Select all.
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
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <h3 style={{ marginTop: 0 }}>Edit stock location</h3>
        <p style={{ marginTop: 0, color: "#64748b", fontSize: "13px" }}>
          Update address, which categories appear here, and linked properties.
        </p>

        <form className="inventory-form" onSubmit={handleSave}>
          <h4 style={{ margin: "8px 0 0", fontSize: "14px" }}>Details</h4>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>
              <span>Name *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={busy || !canWrite}
              />
            </label>
            <label>
              <span>Address</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Optional"
                disabled={busy || !canWrite}
              />
            </label>
          </div>

          <h4 style={{ margin: "12px 0 0", fontSize: "14px" }}>Visible categories</h4>
          <p style={{ margin: 0, color: "#64748b", fontSize: "12px" }}>
            Choose which supply-item categories appear on this location’s On hand and Catalogue
            tabs.
          </p>
          <div className="checklist-box">
            <label
              className="checklist-row"
              style={{ cursor: canWrite ? "pointer" : "default" }}
            >
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
              <p style={{ color: "#64748b", fontSize: "13px", margin: "8px 0 0" }}>
                No named categories yet. Add categories on supply items to filter by them here.
              </p>
            ) : (
              availableCategories.map((category) => (
                <label
                  key={category}
                  className="checklist-row"
                  style={{ cursor: canWrite ? "pointer" : "default" }}
                >
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
          {canWrite && availableCategories.length > 0 && (
            <div className="checklist-bulk-actions">
              <button
                type="button"
                className="secondary"
                onClick={selectAllCategories}
                disabled={busy}
              >
                Select all
              </button>
              <button
                type="button"
                className="secondary"
                onClick={deselectAllCategories}
                disabled={busy || selectedCategories.size === 0}
              >
                Deselect all
              </button>
            </div>
          )}

          <h4 style={{ margin: "16px 0 0", fontSize: "14px" }}>Linked properties</h4>
          <p style={{ margin: 0, color: "#64748b", fontSize: "12px" }}>
            {canWrite
              ? "Choose which properties this stock location can supply."
              : "Properties this stock location can supply."}
          </p>
          {loading ? (
            <p style={{ color: "#64748b", fontSize: "13px" }}>Loading properties…</p>
          ) : teamProperties.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "13px" }}>
              No properties yet. Add properties from the Properties page.
            </p>
          ) : (
            <>
              <div className="checklist-box checklist-box--tall">
                {linkedPropertiesSorted.linked.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <div className="checklist-group-heading">Currently linked</div>
                    {linkedPropertiesSorted.linked.map((p) => (
                      <label
                        key={p.id}
                        className="checklist-row"
                        style={{ cursor: canWrite ? "pointer" : "default" }}
                      >
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
                )}
                {linkedPropertiesSorted.other.length > 0 && (
                  <div>
                    <div className="checklist-group-heading">
                      {linkedPropertiesSorted.linked.length > 0
                        ? "Other properties"
                        : "Properties"}
                    </div>
                    {linkedPropertiesSorted.other.map((p) => (
                      <label
                        key={p.id}
                        className="checklist-row"
                        style={{ cursor: canWrite ? "pointer" : "default" }}
                      >
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
                )}
              </div>
              {canWrite && (
                <div className="checklist-bulk-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={selectAllProperties}
                    disabled={busy}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={deselectAllProperties}
                    disabled={busy || selectedPropertyIds.size === 0}
                  >
                    Deselect all
                  </button>
                </div>
              )}
            </>
          )}

          {error ? (
            <p style={{ color: "#b91c1c", fontSize: "14px", marginTop: "12px" }}>{error}</p>
          ) : null}

          <div className="form-actions" style={{ marginTop: "16px" }}>
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              {canWrite ? "Cancel" : "Close"}
            </button>
            {canWrite && (
              <button type="submit" disabled={busy || loading}>
                {busy ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
