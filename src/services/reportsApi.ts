import { apiRequest } from "../config/api";

export interface InventoryMovement {
  id: string;
  teamId: string | null;
  inventoryItemId: string;
  quantityDelta: number;
  movementType: string;
  referenceType: string | null;
  referenceId: string | null;
  referenceLabel: string | null;
  createdAt: string;
  itemName?: string;
  unit?: string;
}

export interface ReportsSummary {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalCostValue: number;
  totalRetailValue: number;
}

export const reportsApi = {
  getMovements: async (params?: {
    inventoryItemId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<InventoryMovement[]> => {
    const search = new URLSearchParams();
    if (params?.inventoryItemId) search.set("inventoryItemId", params.inventoryItemId);
    if (params?.fromDate) search.set("fromDate", params.fromDate);
    if (params?.toDate) search.set("toDate", params.toDate);
    if (params?.limit != null) search.set("limit", String(params.limit));
    const qs = search.toString();
    return apiRequest<InventoryMovement[]>(`/reports/movements${qs ? `?${qs}` : ""}`);
  },

  getSummary: async (): Promise<ReportsSummary> => {
    return apiRequest<ReportsSummary>("/reports/summary");
  },
};
