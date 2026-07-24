import { apiRequest } from "../config/api";
import type { SupplyItem, SupplyItemFormValues, Sku, SkuFormValues } from "../types";

export const supplyItemsApi = {
  getAll: async (opts?: { includeArchived?: boolean }): Promise<SupplyItem[]> => {
    const qs = opts?.includeArchived ? "?includeArchived=true" : "";
    return apiRequest<SupplyItem[]>(`/supply-items${qs}`);
  },

  getById: async (id: string): Promise<SupplyItem> => {
    return apiRequest<SupplyItem>(`/supply-items/${id}`);
  },

  create: async (values: SupplyItemFormValues): Promise<SupplyItem> => {
    return apiRequest<SupplyItem>("/supply-items", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },

  update: async (
    id: string,
    values: Partial<SupplyItemFormValues> & { archived?: boolean }
  ): Promise<SupplyItem> => {
    return apiRequest<SupplyItem>(`/supply-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
  },
};

export const skusApi = {
  getAll: async (opts?: {
    includeArchived?: boolean;
    supplyItemId?: string;
    stockLocationId?: string;
  }): Promise<Sku[]> => {
    const params = new URLSearchParams();
    if (opts?.includeArchived) params.set("includeArchived", "true");
    if (opts?.supplyItemId) params.set("supplyItemId", opts.supplyItemId);
    if (opts?.stockLocationId) params.set("stockLocationId", opts.stockLocationId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest<Sku[]>(`/skus${qs}`);
  },

  getById: async (id: string): Promise<Sku> => {
    return apiRequest<Sku>(`/skus/${id}`);
  },

  create: async (values: SkuFormValues): Promise<Sku> => {
    return apiRequest<Sku>("/skus", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },

  update: async (
    id: string,
    values: Partial<Omit<SkuFormValues, "supplyItemId" | "stockLocationId">> & {
      archived?: boolean;
    }
  ): Promise<Sku> => {
    return apiRequest<Sku>(`/skus/${id}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
  },
};
