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

  const exportToJson = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJsonItems = (subset: InventoryItem[], filename: string) => {
    const blob = new Blob([JSON.stringify(subset, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.replace(/[^a-zA-Z0-9._-]/g, "_") + (filename.endsWith(".json") ? "" : ".json");
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
    exportToJson,
    exportToJsonItems,
    refresh: loadItems
  };
};
