import React from "react";
import { InventoryItem, Warehouse } from "../types";

type Props = {
  items: InventoryItem[];
  warehouses?: Warehouse[];
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
};

export const InventoryTable: React.FC<Props> = ({
  items,
  warehouses = [],
  onEdit,
  onDelete
}) => {
  const getWarehouseName = (warehouseId: string | undefined) => {
    if (!warehouseId) return null;
    const warehouse = warehouses.find((w) => w.id === warehouseId);
    return warehouse?.name || null;
  };
  if (!items.length) {
    return (
      <div className="empty-state">
        <h3>No items yet</h3>
        <p>Add your first inventory item using the form above.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="inventory-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th>Category</th>
            <th>Warehouse</th>
            <th>Location</th>
            <th>Quantity</th>
            <th>Price Bought</th>
            <th>Markup %</th>
            <th>Final Price</th>
            <th>Reorder pt.</th>
            <th>Status</th>
            <th>Updated</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isOut = item.quantity === 0;
            const isLow =
              item.quantity > 0 && item.quantity <= item.reorderPoint;
            const status = isOut
              ? "Out of stock"
              : isLow
              ? "Low stock"
              : "In stock";

            return (
              <tr key={item.id}>
                <td>
                  <div className="primary-cell">
                    <span className="primary-text">{item.name}</span>
                    {item.notes && (
                      <span className="secondary-text">{item.notes}</span>
                    )}
                    {item.tags.length > 0 && (
                      <div className="tags">
                        {item.tags.map((tag) => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td>{item.sku}</td>
                <td>{item.category || "—"}</td>
                <td>{getWarehouseName(item.warehouseId) || "—"}</td>
                <td>{item.location || "—"}</td>
                <td>
                  {item.quantity} {item.unit}
                </td>
                <td>{formatCurrency(item.priceBoughtFor)}</td>
                <td>{item.markupPercentage.toFixed(2)}%</td>
                <td>{formatCurrency(item.finalPrice)}</td>
                <td>{item.reorderPoint}</td>
                <td>
                  <span
                    className={`status-pill ${
                      isOut ? "status-out" : isLow ? "status-low" : "status-ok"
                    }`}
                  >
                    {status}
                  </span>
                </td>
                <td>{formatDate(item.updatedAt)}</td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onEdit(item)}
                    aria-label="Edit item"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => onDelete(item.id)}
                    aria-label="Delete item"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

