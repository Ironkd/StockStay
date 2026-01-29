import { apiRequest } from "../config/api";
import { Invoice } from "../types";

export const invoicesApi = {
  getAll: async (): Promise<Invoice[]> => {
    return apiRequest<Invoice[]>("/invoices");
  },

  getById: async (id: string): Promise<Invoice> => {
    return apiRequest<Invoice>(`/invoices/${id}`);
  },

  create: async (invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">): Promise<Invoice> => {
    return apiRequest<Invoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(invoice),
    });
  },

  update: async (id: string, invoice: Partial<Omit<Invoice, "id" | "createdAt" | "updatedAt">>): Promise<Invoice> => {
    return apiRequest<Invoice>(`/invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(invoice),
    });
  },

  delete: async (id: string): Promise<void> => {
    return apiRequest<void>(`/invoices/${id}`, {
      method: "DELETE",
    });
  },
};
