import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { locationSupplyThresholdsApi } from "../services/catalogueApi";
import type { LocationLowStockRow } from "../types";

export const ShoppingListPage: React.FC = () => {
  const [lowStock, setLowStock] = useState<LocationLowStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await locationSupplyThresholdsApi.listLowStock();
      setLowStock(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load low stock");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const byCategory = useMemo(() => {
    const groups: Record<string, LocationLowStockRow[]> = {};
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
  }, [lowStock]);

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
          Supply items at stock locations at or below reorder point. Receive packs at the
          location to clear items off the list.
        </p>
        <button type="button" className="clear-button" onClick={() => navigate("/stock")}>
          View Stock
        </button>
      </div>

      {totalLowStock === 0 ? (
        <div className="empty-state">
          No items on the shopping list. Set reorder points on supply items at a stock
          location, or receive stock to raise on-hand levels.
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
                    const onHand = Number(row.onHandBase);
                    const reorderPoint = Number(row.reorderPoint);
                    const need = Number(row.suggestedBuyBase) || 0;
                    const unit =
                      row.supplyItem?.baseUnit?.code ||
                      row.supplyItem?.baseUnit?.name ||
                      "units";
                    const isOut = onHand <= 0;
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
                              row.stockLocationId &&
                              navigate(`/stock/${row.stockLocationId}`)
                            }
                            style={{ cursor: row.stockLocationId ? "pointer" : undefined }}
                          >
                            {row.stockLocation?.name ?? "Location"}
                          </span>
                          {" · "}
                          On hand: {onHand} {unit}
                          {reorderPoint > 0 && <> · Reorder at {reorderPoint}</>}
                          {need > 0 && (
                            <span
                              className={
                                isOut ? "shopping-list-need out" : "shopping-list-need"
                              }
                            >
                              {" "}
                              · Need {need} {unit}
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
