import React, { ChangeEvent } from "react";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  categories: string[];
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  locations: string[];
  locationFilter: string;
  onLocationFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onImport: (json: string) => void;
  onExport: () => void;
  onClose: () => void;
};

export const FilterModal: React.FC<Props> = ({
  search,
  onSearchChange,
  categories,
  categoryFilter,
  onCategoryFilterChange,
  locations,
  locationFilter,
  onLocationFilterChange,
  statusFilter,
  onStatusFilterChange,
  onImport,
  onExport,
  onClose
}) => {
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onImport(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3>Filters & Search</h3>
          <button
            type="button"
            className="icon-button close-button"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <label>
            <span>Search</span>
            <input
              className="search-input"
              type="search"
              placeholder="Search by name, SKU, category, location…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <span>Category</span>
            <select
              value={categoryFilter}
              onChange={(e) => onCategoryFilterChange(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="all">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Location</span>
            <select
              value={locationFilter}
              onChange={(e) => onLocationFilterChange(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="all">All locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="all">All statuses</option>
              <option value="in-stock">In stock</option>
              <option value="low-stock">Low stock</option>
              <option value="out-of-stock">Out of stock</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: "8px", marginTop: "8px", paddingTop: "16px", borderTop: "1px solid rgba(148, 163, 184, 0.3)" }}>
            <label className="import-button" style={{ flex: 1 }}>
              Import JSON
              <input type="file" accept="application/json" onChange={handleFileChange} />
            </label>
            <button type="button" className="secondary" onClick={onExport} style={{ flex: 1 }}>
              Export JSON
            </button>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: "20px" }}>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
