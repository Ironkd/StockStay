import { apiRequest } from "../config/api";
import { toQuery } from "../utils/toQuery";
import type {
  SupplyItem,
  SupplyItemFormValues,
  Sku,
  SkuFormValues,
  LocationSupplyThreshold,
  LocationLowStockRow,
  StockTransaction,
  LedgerPostResult,
  UnitOfMeasure,
} from "../types";

/** Units of measure for supply items (also exported from stockLocationsApi as unitsOfMeasureApi). */
export const unitsApi = {
  getAll: async (): Promise<UnitOfMeasure[]> => {
    return apiRequest<UnitOfMeasure[]>("/units-of-measure");
  },
};

/** Catalogue clients — used by stock flows today; receive/UI admin coming soon. */
export const supplyItemsApi = {
  getAll: async (opts?: { includeArchived?: boolean }): Promise<SupplyItem[]> => {
    return apiRequest<SupplyItem[]>(
      `/supply-items${toQuery({ includeArchived: opts?.includeArchived })}`
    );
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
    return apiRequest<Sku[]>(
      `/skus${toQuery({
        includeArchived: opts?.includeArchived,
        supplyItemId: opts?.supplyItemId,
        stockLocationId: opts?.stockLocationId,
      })}`
    );
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

  /** Ensure a zero StockOnHand row exists for this SKU at a location. */
  stockAtLocation: async (id: string, stockLocationId: string): Promise<Sku> => {
    return apiRequest<Sku>(`/skus/${id}/stock-locations/${stockLocationId}`, {
      method: "POST",
    });
  },

  /** Pack receive into StockOnHand (ledger). Updates location last rate + catalogue defaults. */
  receive: async (
    id: string,
    values: {
      stockLocationId: string;
      quantity: number | string;
      purchasePrice?: number | string;
      purchasedAt?: string;
    }
  ): Promise<LedgerPostResult> => {
    return apiRequest<LedgerPostResult>(`/skus/${id}/receive`, {
      method: "POST",
      body: JSON.stringify(values),
    });
  },

  adjust: async (
    id: string,
    values: {
      stockLocationId: string;
      quantityDelta: number | string;
      reason?: string;
    }
  ): Promise<LedgerPostResult> => {
    return apiRequest<LedgerPostResult>(`/skus/${id}/adjust`, {
      method: "POST",
      body: JSON.stringify(values),
    });
  },
};

export const locationSupplyThresholdsApi = {
  listByLocation: async (locationId: string): Promise<LocationSupplyThreshold[]> => {
    return apiRequest<LocationSupplyThreshold[]>(
      `/stock-locations/${locationId}/supply-thresholds`
    );
  },

  upsert: async (
    locationId: string,
    values: {
      supplyItemId: string;
      reorderPoint: number | string;
      reorderQuantity: number | string;
    }
  ): Promise<LocationSupplyThreshold> => {
    return apiRequest<LocationSupplyThreshold>(
      `/stock-locations/${locationId}/supply-thresholds`,
      {
        method: "PUT",
        body: JSON.stringify(values),
      }
    );
  },

  listLowStock: async (): Promise<LocationLowStockRow[]> => {
    return apiRequest<LocationLowStockRow[]>("/location-low-stock");
  },
};

export const stockTransactionsApi = {
  getAll: async (opts?: {
    skuId?: string;
    stockLocationId?: string;
    entityType?: string;
    entityId?: string;
    postingId?: string;
    transactionType?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<StockTransaction[]> => {
    return apiRequest<StockTransaction[]>(
      `/stock-transactions${toQuery({
        skuId: opts?.skuId,
        stockLocationId: opts?.stockLocationId,
        entityType: opts?.entityType,
        entityId: opts?.entityId,
        postingId: opts?.postingId,
        transactionType: opts?.transactionType,
        fromDate: opts?.fromDate,
        toDate: opts?.toDate,
        limit: opts?.limit,
      })}`
    );
  },
};
