import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { propertyStocksApi } from "../services/catalogueApi";
import type { PropertyStock } from "../types";

export const ShoppingListPage: React.FC = () => {
  const [propertyStocks, setPropertyStocks] = useState<PropertyStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await propertyStocksApi.getAll();
      setPropertyStocks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stock");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Refetch when user returns to this tab so items drop off after replenishing elsewhere
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const byCategory = useMemo(() => {
    const lowStock = propertyStocks.filter(
      (row) => Number(row.quantity) <= Number(row.reorderPoint)
    );
    const groups: Record<string, PropertyStock[]> = {};
    for (const row of lowStock) {
      const cat = row.supplyItem?.category?.trim() || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(row);
    }
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) =>
        (a.supplyItem?.name || "").localeCompare(b.supplyItem?.name || "")
      );
    }
    const order = Object.keys(groups).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    return { groups, order };
  }, [propertyStocks]);

  if (loading) {
    return (
      <div className="shopping-list-page">
        <h2>Shopping List</h2>
        <div className="empty-state">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shopping-list-page">
        <h2>Shopping List</h2>
        <div className="empty-state error">{error}</div>
      </div>
    );
  }

  const totalLowStock = byCategory.order.reduce(
    (sum, cat) => sum + byCategory.groups[cat].length,
    0
  );

  return (
    <div className="shopping-list-page">
      <div className="shopping-list-header">
        <h2>Shopping List</h2>
        <p className="shopping-list-subtitle">
          Property stock at or below reorder point, grouped by category. Replenish from a
          stock location to clear items off the list.
        </p>
        <button
          type="button"
          className="clear-button"
          onClick={() => navigate("/stock")}
        >
          View Stock
        </button>
      </div>

      {totalLowStock === 0 ? (
        <div className="empty-state">
          No items on the shopping list. All property stock is above reorder point.
        </div>
      ) : (
        <div className="shopping-list-by-category">
          {byCategory.order.map((category) => {
            const list = byCategory.groups[category];
            return (
              <div key={category} className="shopping-list-category">
                <h3 className="shopping-list-category-title">{category}</h3>
                <ul className="shopping-list-items">
                  {list.map((row) => {
                    const quantity = Number(row.quantity);
                    const reorderPoint = Number(row.reorderPoint);
                    const reorderQuantity = Number(row.reorderQuantity);
                    const need = Math.max(
                      0,
                      reorderQuantity > 0 ? reorderQuantity : reorderPoint - quantity
                    );
                    const isOut = quantity <= 0;
                    return (
                      <li key={row.id} className="shopping-list-item">
                        <span className="shopping-list-item-name">
                          {row.supplyItem?.name || "Unknown item"}
                        </span>
                        <span className="shopping-list-item-meta">
                          <span
                            className="shopping-list-property"
                            role="link"
                            tabIndex={0}
                            onClick={() =>
                              row.propertyId && navigate(`/properties/${row.propertyId}`)
                            }
                            style={{ cursor: row.propertyId ? "pointer" : undefined }}
                          >
                            {row.property?.name ?? "No property"}
                          </span>
                          {" · "}
                          Current: {quantity}
                          {reorderPoint > 0 && <> · Reorder at {reorderPoint}</>}
                          {need > 0 && (
                            <span
                              className={
                                isOut
                                  ? "shopping-list-need out"
                                  : "shopping-list-need"
                              }
                            >
                              {" "}
                              · Need {need}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
