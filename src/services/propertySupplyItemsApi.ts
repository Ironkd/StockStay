import { apiRequest } from "../config/api";
import type { PropertySupplyItem } from "../types";

/** The standing list of supply items a property is stocked with (par quantity + recent activity). */
export const propertySupplyItemsApi = {
  listByProperty: async (propertyId: string): Promise<PropertySupplyItem[]> => {
    return apiRequest<PropertySupplyItem[]>(`/properties/${propertyId}/supply-items`);
  },

  upsert: async (
    propertyId: string,
    supplyItemId: string,
    values: { parQuantity: number | string }
  ): Promise<PropertySupplyItem> => {
    return apiRequest<PropertySupplyItem>(
      `/properties/${propertyId}/supply-items/${supplyItemId}`,
      {
        method: "PUT",
        body: JSON.stringify(values),
      }
    );
  },

  remove: async (propertyId: string, supplyItemId: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(
      `/properties/${propertyId}/supply-items/${supplyItemId}`,
      { method: "DELETE" }
    );
  },
};
