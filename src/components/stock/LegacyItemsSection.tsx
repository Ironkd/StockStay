import React from "react";
import type { InventoryItem, Property } from "../../types";
import { SummaryBar } from "../SummaryBar";
import { InventoryTable } from "../InventoryTable";

type Props = {
  legacyOpen: boolean;
  onLegacyOpenChange: (open: boolean) => void;
  items: InventoryItem[];
  filteredItems: InventoryItem[];
  visibleProperties: Property[];
  onAddItem: () => void;
  onOpenCategoryModal: () => void;
  onExportCsv: () => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onAddQuantity: (item: InventoryItem) => void;
  onSubtract: (item: InventoryItem) => void;
};

export const LegacyItemsSection: React.FC<Props> = ({
  legacyOpen,
  onLegacyOpenChange,
  items,
  filteredItems,
  visibleProperties,
  onAddItem,
  onOpenCategoryModal,
  onExportCsv,
  onEdit,
  onDelete,
  onAddQuantity,
  onSubtract,
}) => (
  <details
    className="legacy-items-details"
    open={legacyOpen}
    onToggle={(e) => onLegacyOpenChange((e.target as HTMLDetailsElement).open)}
  >
    <summary>Legacy items (deprecated)</summary>
    <p style={{ fontSize: "13px", color: "#64748b", marginTop: 0 }}>
      Bill-back uses Replenish / Return. This table is the old per-property item list and will be retired later.
    </p>
    <div style={{ marginBottom: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <button type="button" className="secondary" onClick={onAddItem}>
        Add legacy item
      </button>
      <button type="button" className="secondary" onClick={onOpenCategoryModal}>
        Categories
      </button>
      <button type="button" className="secondary" onClick={onExportCsv}>
        Export CSV
      </button>
    </div>
    <SummaryBar items={items} filteredItems={filteredItems} />
    <InventoryTable
      items={filteredItems}
      properties={visibleProperties}
      onEdit={onEdit}
      onDelete={onDelete}
      onAddQuantity={onAddQuantity}
      onSubtract={onSubtract}
    />
  </details>
);
