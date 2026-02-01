import { apiRequest } from "../config/api";
import type { Warehouse, WarehouseFormValues } from "../types";

export const warehousesApi = {
  getAll: async (): Promise<Warehouse[]> => {
    return apiRequest<Warehouse[]>("/warehouses");
  },

  create: async (values: WarehouseFormValues): Promise<Warehouse> => {
    return apiRequest<Warehouse>("/warehouses", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },

  update: async (id: string, values: WarehouseFormValues): Promise<Warehouse> => {
    return apiRequest<Warehouse>(`/warehouses/${id}`, {
      method: "PUT",
      body: JSON.stringify(values),
    });
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/warehouses/${id}`, {
      method: "DELETE",
    });
  },
};
