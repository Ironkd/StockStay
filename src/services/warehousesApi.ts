import { apiRequest } from "../config/api";
import type { Warehouse } from "../types";

export const warehousesApi = {
  getAll: async (): Promise<Warehouse[]> => {
    return apiRequest<Warehouse[]>("/warehouses");
  },
};
