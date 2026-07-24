import React from "react";
import type { Property, PropertyStock, Replenishment } from "../../types";

type Props = {
  activePropertyTab: string | null;
  onActivePropertyTabChange: (tab: string) => void;
  visibleProperties: Property[];
  propertyStocks: PropertyStock[];
  filteredPropertyStocks: PropertyStock[];
  recentReplenishments: Replenishment[];
  getPropertyById: (id: string) => Property | undefined;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (id: string) => void;
};

export const PropertyStockPanel: React.FC<Props> = ({
  activePropertyTab,
  onActivePropertyTabChange,
  visibleProperties,
  propertyStocks,
  filteredPropertyStocks,
  recentReplenishments,
  getPropertyById,
  onEditProperty,
  onDeleteProperty,
}) => (
  <>
    <div className="property-tabs">
      <button
        type="button"
        className={`property-tab ${activePropertyTab === "all" ? "active" : ""}`}
        onClick={() => onActivePropertyTabChange("all")}
      >
        All properties
        <span className="tab-count">({filteredPropertyStocks.length})</span>
      </button>
      {visibleProperties.map((property) => {
        const stockCount = propertyStocks.filter((s) => s.propertyId === property.id).length;
        return (
          <button
            key={property.id}
            type="button"
            className={`property-tab ${activePropertyTab === property.id ? "active" : ""}`}
            onClick={() => onActivePropertyTabChange(property.id)}
          >
            {property.name}
            <span className="tab-count">({stockCount})</span>
          </button>
        );
      })}
    </div>

    {activePropertyTab && activePropertyTab !== "all" && (
      <div style={{ marginBottom: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const p = getPropertyById(activePropertyTab);
            if (p) onEditProperty(p);
          }}
        >
          Edit property
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => onDeleteProperty(activePropertyTab)}
        >
          Delete property
        </button>
      </div>
    )}

    <h3 style={{ marginTop: 0 }}>Property stock</h3>
    {filteredPropertyStocks.length === 0 ? (
      <p style={{ color: "#64748b", fontSize: "14px" }}>
        Replenish from a stock location to deploy items here.
      </p>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Supply item</th>
              <th>Qty (base)</th>
            </tr>
          </thead>
          <tbody>
            {filteredPropertyStocks.map((row) => (
              <tr key={row.id}>
                <td>{row.property?.name || "—"}</td>
                <td>{row.supplyItem?.name || "—"}</td>
                <td>{Number(row.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    <h3 style={{ marginTop: "20px" }}>Recent moves</h3>
    {recentReplenishments.length === 0 ? (
      <p style={{ color: "#64748b", fontSize: "14px" }}>No replenishments or returns yet.</p>
    ) : (
      <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "14px" }}>
        {recentReplenishments.slice(0, 10).map((r) => {
          const isTransfer = !!r.transferGroupId;
          const label = isTransfer
            ? r.direction === "return"
              ? "transfer out"
              : "transfer in"
            : r.direction;
          return (
            <li key={r.id}>
              <strong>{label}</strong>
              {isTransfer ? " · pass-through" : ""} · {r.property?.name || "Property"} ←{" "}
              {r.stockLocation?.name || "Location"} · {(r.lines || []).length} line(s) ·{" "}
              {new Date(r.createdAt).toLocaleString()}
            </li>
          );
        })}
      </ul>
    )}
  </>
);
