import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useInventory } from "../hooks/useInventory";
import { useWarehouses } from "../hooks/useWarehouses";
import type { InventoryItem } from "../types";

export const ShoppingListPage: React.FC = () => {
  const { items, loading, error, refresh } = useInventory();
  const { getWarehouseById } = useWarehouses();
  const navigate = useNavigate();

  // Refetch when user returns to this tab so items drop off after adding stock elsewhere
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refresh]);

  const byCategory = useMemo(() => {
    const lowStock = items.filter(
      (item) => item.quantity <= item.reorderPoint
    ) as InventoryItem[];
    const groups: Record<string, InventoryItem[]> = {};
    for (const item of lowStock) {
      const cat = item.category?.trim() || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    const order = Object.keys(groups).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    return { groups, order };
  }, [items]);

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
          Items at or below reorder point, grouped by category. When you add stock in Inventory, items drop off the list automatically.
        </p>
        <button
          type="button"
          className="clear-button"
          onClick={() => navigate("/inventory")}
        >
          View Inventory
        </button>
      </div>

      {totalLowStock === 0 ? (
        <div className="empty-state">
          No items on the shopping list. All stock is above reorder point.
        </div>
      ) : (
        <div className="shopping-list-by-category">
          {byCategory.order.map((category) => {
            const list = byCategory.groups[category];
            return (
              <div key={category} className="shopping-list-category">
                <h3 className="shopping-list-category-title">{category}</h3>
                <ul className="shopping-list-items">
                  {list.map((item) => {
                    const need = Math.max(
                      0,
                      Math.ceil(item.reorderPoint - item.quantity)
                    );
                    const isOut = item.quantity === 0;
                    return (
                      <li key={item.id} className="shopping-list-item">
                        <span className="shopping-list-item-name">
                          {item.name}
                          {item.sku ? ` (${item.sku})` : ""}
                        </span>
                        <span className="shopping-list-item-meta">
                          <span className="shopping-list-warehouse">
                            {getWarehouseById(item.warehouseId)?.name ?? "No warehouse"}
                          </span>
                          {" · "}
                          Current: {item.quantity} {item.unit}
                          {item.reorderPoint > 0 && (
                            <> · Reorder at {item.reorderPoint}</>
                          )}
                          {need > 0 && (
                            <span
                              className={
                                isOut
                                  ? "shopping-list-need out"
                                  : "shopping-list-need"
                              }
                            >
                              {" "}
                              · Need {need} {item.unit}
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
