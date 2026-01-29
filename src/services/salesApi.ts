import { apiRequest } from "../config/api";
import { Sale } from "../types";

export const salesApi = {
  getAll: async (): Promise<Sale[]> => {
    return apiRequest<Sale[]>("/sales");
  },

  getById: async (id: string): Promise<Sale> => {
    return apiRequest<Sale>(`/sales/${id}`);
  },

  create: async (sale: Omit<Sale, "id" | "createdAt" | "updatedAt">): Promise<Sale> => {
    return apiRequest<Sale>("/sales", {
      method: "POST",
      body: JSON.stringify(sale),
    });
  },

  update: async (id: string, sale: Partial<Omit<Sale, "id" | "createdAt" | "updatedAt">>): Promise<Sale> => {
    return apiRequest<Sale>(`/sales/${id}`, {
      method: "PUT",
      body: JSON.stringify(sale),
    });
  },

  delete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/sales/${id}`, {
      method: "DELETE",
    });
  },
};
