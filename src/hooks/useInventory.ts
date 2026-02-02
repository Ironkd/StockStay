import { useEffect, useState } from "react";
import { InventoryItem, InventoryItemFormValues } from "../types";
import { inventoryApi } from "../services/inventoryApi";

export const useInventory = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryApi.getAll();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory");
      console.error("Error loading inventory:", err);
    } finally {
      setLoading(false);
    }
  };

  const addItem = async (values: InventoryItemFormValues | InventoryItemFormValues[]) => {
    try {
      setError(null);
      if (Array.isArray(values)) {
        // Bulk add
        const newItems = await inventoryApi.bulkCreate(values);
        setItems((prev) => [...prev, ...newItems]);
      } else {
        // Single add
        const newItem = await inventoryApi.create(values);
        setItems((prev) => [...prev, newItem]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
      throw err;
    }
  };

  const updateItem = async (id: string, values: InventoryItemFormValues) => {
    try {
      setError(null);
      const updatedItem = await inventoryApi.update(id, values);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? updatedItem : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item");
      throw err;
    }
  };

  const removeItem = async (id: string) => {
    try {
      setError(null);
      await inventoryApi.delete(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
      throw err;
    }
  };

  const clearAll = async () => {
    if (!window.confirm("Clear all inventory items? This cannot be undone.")) {
      return;
    }
    try {
      setError(null);
      await inventoryApi.deleteAll();
      setItems([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear all items");
      throw err;
    }
  };

  const importFromJson = async (json: string) => {
    try {
      setError(null);
      const parsed = JSON.parse(json);
      const itemsArray = Array.isArray(parsed) ? parsed : [parsed];
      const validItems = itemsArray.filter(
        (item: any) =>
          typeof item.name === "string" &&
          typeof item.sku === "string"
      ) as InventoryItemFormValues[];

      if (!validItems.length) {
        alert("No valid items found in JSON.");
        return;
      }

      const newItems = await inventoryApi.bulkCreate(validItems);
      setItems((prev) => [...prev, ...newItems]);
    } catch (err) {
      console.error(err);
      alert("Invalid JSON file or failed to import.");
    }
  };

  const transfer = async (params: {
    fromPropertyId: string;
    toPropertyId: string;
    inventoryItemId: string;
    quantity: number;
  }) => {
    try {
      setError(null);
      await inventoryApi.transfer(params);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
      throw err;
    }
  };

  /** Escape a value for CSV (quote if needed, double internal quotes). */
  const csvEscape = (v: string | number | undefined | null): string => {
    const s = v === undefined || v === null ? "" : String(v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  /** Convert inventory items to CSV string with header row. */
  const itemsToCsv = (list: InventoryItem[]): string => {
    const headers = [
      "Name", "SKU", "Category", "Location", "Property ID",
      "Quantity", "Unit", "Reorder Point", "Reorder Quantity",
      "Price Bought For", "Markup %", "Final Price",
      "Tags", "Notes", "Created At", "Updated At"
    ];
    const rows = list.map((item) => [
      csvEscape(item.name),
      csvEscape(item.sku),
      csvEscape(item.category),
      csvEscape(item.location),
      csvEscape(item.propertyId ?? ""),
      csvEscape(item.quantity),
      csvEscape(item.unit),
      csvEscape(item.reorderPoint),
      csvEscape(item.reorderQuantity ?? ""),
      csvEscape(item.priceBoughtFor),
      csvEscape(item.markupPercentage),
      csvEscape(item.finalPrice),
      csvEscape(Array.isArray(item.tags) ? item.tags.join(", ") : ""),
      csvEscape(item.notes ?? ""),
      csvEscape(item.createdAt),
      csvEscape(item.updatedAt)
    ].join(","));
    return [headers.join(","), ...rows].join("\r\n");
  };

  const exportToCsv = () => {
    const csv = itemsToCsv(items);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToCsvItems = (subset: InventoryItem[], filename: string) => {
    const csv = itemsToCsv(subset);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.replace(/[^a-zA-Z0-9._-]/g, "_") + (filename.endsWith(".csv") ? "" : ".csv");
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    items,
    loading,
    error,
    addItem,
    updateItem,
    removeItem,
    clearAll,
    transfer,
    importFromJson,
    exportToCsv,
    exportToCsvItems,
    refresh: loadItems
  };
};
