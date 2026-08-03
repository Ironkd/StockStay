import { apiRequest, API_BASE_URL } from "../config/api";
import { Invoice } from "../types";

function authHeaders(): HeadersInit {
  const token = sessionStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function downloadCsv(endpoint: string, filename: string): Promise<void> {
  const url = `${API_BASE_URL}${endpoint}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Export failed");
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

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

  update: async (
    id: string,
    invoice: Partial<Omit<Invoice, "id" | "createdAt" | "updatedAt">>
  ): Promise<Invoice> => {
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

  send: async (id: string): Promise<{ message: string; sentTo?: string }> => {
    return apiRequest<{ message: string; sentTo?: string }>(`/invoices/${id}/send`, {
      method: "POST",
    });
  },

  generateDrafts: async (
    clientId?: string
  ): Promise<{ created: Invoice[]; skipped: unknown[]; count: number }> => {
    return apiRequest("/billing/generate-drafts", {
      method: "POST",
      body: JSON.stringify(clientId ? { clientId } : {}),
    });
  },

  exportCsv: async (id: string, invoiceNumber?: string): Promise<void> => {
    await downloadCsv(
      `/invoices/${id}/export.csv`,
      `invoice-${invoiceNumber || id}.csv`
    );
  },

  exportAllCsv: async (ids?: string[]): Promise<void> => {
    const q = ids?.length ? `?ids=${ids.map(encodeURIComponent).join(",")}` : "";
    await downloadCsv(
      `/invoices/export.csv${q}`,
      `invoices-${new Date().toISOString().slice(0, 10)}.csv`
    );
  },
};
