import { apiRequest } from "../config/api";
import type {
  SupplyItem,
  SupplyItemFormValues,
  Sku,
  SkuFormValues,
  PropertyStock,
  StockTransaction,
  LedgerPostResult,
} from "../types";

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

  receive: async (id: string, quantity: number | string): Promise<LedgerPostResult> => {
    return apiRequest<LedgerPostResult>(`/skus/${id}/receive`, {
      method: "POST",
      body: JSON.stringify({ quantity }),
    });
  },

  adjust: async (
    id: string,
    values: { quantityDelta: number | string; reason?: string }
  ): Promise<LedgerPostResult> => {
    return apiRequest<LedgerPostResult>(`/skus/${id}/adjust`, {
      method: "POST",
      body: JSON.stringify(values),
    });
  },
};

export const propertyStocksApi = {
  getAll: async (): Promise<PropertyStock[]> => {
    return apiRequest<PropertyStock[]>("/property-stocks");
  },
};

export const stockTransactionsApi = {
  getAll: async (opts?: {
    skuId?: string;
    entityType?: string;
    entityId?: string;
    postingId?: string;
    transactionType?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<StockTransaction[]> => {
    const params = new URLSearchParams();
    if (opts?.skuId) params.set("skuId", opts.skuId);
    if (opts?.entityType) params.set("entityType", opts.entityType);
    if (opts?.entityId) params.set("entityId", opts.entityId);
    if (opts?.postingId) params.set("postingId", opts.postingId);
    if (opts?.transactionType) params.set("transactionType", opts.transactionType);
    if (opts?.fromDate) params.set("fromDate", opts.fromDate);
    if (opts?.toDate) params.set("toDate", opts.toDate);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest<StockTransaction[]>(`/stock-transactions${qs}`);
  },
};
