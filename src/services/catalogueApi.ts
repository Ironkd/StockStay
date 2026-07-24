import { apiRequest } from "../config/api";
import { toQuery } from "../utils/toQuery";
import type {
  SupplyItem,
  SupplyItemFormValues,
  Sku,
  SkuFormValues,
  PropertyStock,
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

  /** Pack receive into StockOnHand (ledger). Catalogue admin UI will use this. */
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
    return apiRequest<StockTransaction[]>(
      `/stock-transactions${toQuery({
        skuId: opts?.skuId,
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
