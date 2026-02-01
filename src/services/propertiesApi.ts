import { apiRequest } from "../config/api";
import type { Property, PropertyFormValues } from "../types";

export const propertiesApi = {
  getAll: async (): Promise<Property[]> => {
    return apiRequest<Property[]>("/properties");
  },

  create: async (values: PropertyFormValues): Promise<Property> => {
    return apiRequest<Property>("/properties", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },

  update: async (id: string, values: PropertyFormValues): Promise<Property> => {
    return apiRequest<Property>(`/properties/${id}`, {
      method: "PUT",
      body: JSON.stringify(values),
    });
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/properties/${id}`, {
      method: "DELETE",
    });
  },
};
