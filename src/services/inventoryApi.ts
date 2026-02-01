import { apiRequest } from "../config/api";
import { InventoryItem, InventoryItemFormValues } from "../types";

export const inventoryApi = {
  getAll: async (): Promise<InventoryItem[]> => {
    return apiRequest<InventoryItem[]>("/inventory");
  },

  getById: async (id: string): Promise<InventoryItem> => {
    return apiRequest<InventoryItem>(`/inventory/${id}`);
  },

  create: async (values: InventoryItemFormValues): Promise<InventoryItem> => {
    return apiRequest<InventoryItem>("/inventory", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },

  update: async (id: string, values: InventoryItemFormValues): Promise<InventoryItem> => {
    return apiRequest<InventoryItem>(`/inventory/${id}`, {
      method: "PUT",
      body: JSON.stringify(values),
    });
  },

  delete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/inventory/${id}`, {
      method: "DELETE",
    });
  },

  deleteAll: async (): Promise<void> => {
    return apiRequest<void>("/inventory", {
      method: "DELETE",
    });
  },

  bulkCreate: async (items: InventoryItemFormValues[]): Promise<InventoryItem[]> => {
    return apiRequest<InventoryItem[]>("/inventory/bulk", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  },

  transfer: async (params: {
    fromWarehouseId: string;
    toWarehouseId: string;
    inventoryItemId: string;
    quantity: number;
  }): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>("/inventory/transfer", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },
};
