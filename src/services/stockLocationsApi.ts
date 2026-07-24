import { apiRequest } from "../config/api";
import type {
  StockLocation,
  StockLocationFormValues,
  StockLocationPropertyLink,
  UnitOfMeasure,
} from "../types";

export const unitsOfMeasureApi = {
  getAll: async (): Promise<UnitOfMeasure[]> => {
    return apiRequest<UnitOfMeasure[]>("/units-of-measure");
  },
};

export const stockLocationsApi = {
  getAll: async (opts?: { includeArchived?: boolean }): Promise<StockLocation[]> => {
    const qs = opts?.includeArchived ? "?includeArchived=true" : "";
    return apiRequest<StockLocation[]>(`/stock-locations${qs}`);
  },

  getById: async (id: string): Promise<StockLocation> => {
    return apiRequest<StockLocation>(`/stock-locations/${id}`);
  },

  create: async (values: StockLocationFormValues): Promise<StockLocation> => {
    return apiRequest<StockLocation>("/stock-locations", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },

  update: async (
    id: string,
    values: Partial<StockLocationFormValues> & { archived?: boolean }
  ): Promise<StockLocation> => {
    return apiRequest<StockLocation>(`/stock-locations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
  },

  linkProperty: async (
    stockLocationId: string,
    propertyId: string
  ): Promise<StockLocationPropertyLink> => {
    return apiRequest<StockLocationPropertyLink>(`/stock-locations/${stockLocationId}/properties`, {
      method: "POST",
      body: JSON.stringify({ propertyId }),
    });
  },

  unlinkProperty: async (
    stockLocationId: string,
    propertyId: string
  ): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(
      `/stock-locations/${stockLocationId}/properties/${propertyId}`,
      { method: "DELETE" }
    );
  },
};
