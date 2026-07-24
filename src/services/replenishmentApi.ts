import { apiRequest } from "../config/api";
import { toQuery } from "../utils/toQuery";
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
    return apiRequest<Replenishment[]>(
      `/replenishments${toQuery({
        limit: opts?.limit,
        transferGroupId: opts?.transferGroupId,
      })}`
    );
  },

  getById: async (id: string): Promise<Replenishment> => {
    return apiRequest<Replenishment>(`/replenishments/${id}`);
  },

  getReturnable: async (
    lineId: string
  ): Promise<{ remaining: string; originalBaseQty?: string }> => {
    return apiRequest(`/replenishments/lines/${lineId}/returnable`);
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
