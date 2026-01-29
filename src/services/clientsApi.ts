import { apiRequest } from "../config/api";
import { Client } from "../types";

export const clientsApi = {
  getAll: async (): Promise<Client[]> => {
    return apiRequest<Client[]>("/clients");
  },

  getById: async (id: string): Promise<Client> => {
    return apiRequest<Client>(`/clients/${id}`);
  },

  create: async (client: Omit<Client, "id" | "createdAt" | "updatedAt">): Promise<Client> => {
    return apiRequest<Client>("/clients", {
      method: "POST",
      body: JSON.stringify(client),
    });
  },

  update: async (id: string, client: Partial<Omit<Client, "id" | "createdAt" | "updatedAt">>): Promise<Client> => {
    return apiRequest<Client>(`/clients/${id}`, {
      method: "PUT",
      body: JSON.stringify(client),
    });
  },

  delete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/clients/${id}`, {
      method: "DELETE",
    });
  },
};
