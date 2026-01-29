import React, { useMemo } from "react";
import { InventoryItem } from "../types";

type Props = {
  items: InventoryItem[];
  filteredItems: InventoryItem[];
};

export const SummaryBar: React.FC<Props> = ({ items, filteredItems }) => {
  const { totalCount, totalQuantity, lowStock, outOfStock } = useMemo(() => {
    let totalQuantityAcc = 0;
    let low = 0;
    let out = 0;

    filteredItems.forEach((item) => {
      totalQuantityAcc += item.quantity;
      if (item.quantity === 0) out += 1;
      else if (item.quantity <= item.reorderPoint) low += 1;
    });

    return {
      totalCount: filteredItems.length,
      totalQuantity: totalQuantityAcc,
      lowStock: low,
      outOfStock: out
    };
  }, [filteredItems]);

  return (
    <div className="summary-bar">
      <div className="summary-chip">
        <span className="label">Visible items</span>
        <span className="value">
          {totalCount} / {items.length}
        </span>
      </div>
      <div className="summary-chip">
        <span className="label">Total quantity</span>
        <span className="value">{totalQuantity}</span>
      </div>
      <div className="summary-chip warning">
        <span className="label">Low stock</span>
        <span className="value">{lowStock}</span>
      </div>
      <div className="summary-chip danger">
        <span className="label">Out of stock</span>
        <span className="value">{outOfStock}</span>
      </div>
    </div>
  );
};

