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
};

export const SearchAndFilters: React.FC<Props> = ({
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
  onExport
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
    <div className="filters-row">
      <div className="filters-main">
        <input
          className="search-input"
          type="search"
          placeholder="Search by name, SKU, category, location…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        <select
          value={categoryFilter}
          onChange={(e) => onCategoryFilterChange(e.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          value={locationFilter}
          onChange={(e) => onLocationFilterChange(e.target.value)}
        >
          <option value="all">All locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="in-stock">In stock</option>
          <option value="low-stock">Low stock</option>
          <option value="out-of-stock">Out of stock</option>
        </select>
      </div>

      <div className="filters-actions">
        <label className="import-button">
          Import JSON
          <input type="file" accept="application/json" onChange={handleFileChange} />
        </label>
        <button type="button" className="secondary" onClick={onExport}>
          Export JSON
        </button>
      </div>
    </div>
  );
};

