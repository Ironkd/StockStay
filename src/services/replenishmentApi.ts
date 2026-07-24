import { apiRequest } from "../config/api";
import type {
  Replenishment,
  CreateReplenishmentInput,
  CreateReturnInput,
  CreateTransferInput,
  TransferResult,
  UnbilledLine,
} from "../types";

export const replenishmentApi = {
  create: async (input: CreateReplenishmentInput): Promise<Replenishment> => {
    return apiRequest<Replenishment>("/replenishments", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  list: async (opts?: {
    limit?: number;
    transferGroupId?: string;
  }): Promise<Replenishment[]> => {
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.transferGroupId) params.set("transferGroupId", opts.transferGroupId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest<Replenishment[]>(`/replenishments${qs}`);
  },

  getById: async (id: string): Promise<Replenishment> => {
    return apiRequest<Replenishment>(`/replenishments/${id}`);
  },

  createReturn: async (input: CreateReturnInput): Promise<Replenishment> => {
    return apiRequest<Replenishment>("/replenishments/returns", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  createTransfer: async (input: CreateTransferInput): Promise<TransferResult> => {
    return apiRequest<TransferResult>("/replenishments/transfers", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listUnbilled: async (): Promise<UnbilledLine[]> => {
    return apiRequest<UnbilledLine[]>("/unbilled-lines");
  },
};
