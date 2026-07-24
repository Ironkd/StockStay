import { apiRequest } from "../config/api";
import type {
  Replenishment,
  CreateReplenishmentInput,
  CreateReturnInput,
  UnbilledLine,
} from "../types";

export const replenishmentApi = {
  create: async (input: CreateReplenishmentInput): Promise<Replenishment> => {
    return apiRequest<Replenishment>("/replenishments", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  list: async (opts?: { limit?: number }): Promise<Replenishment[]> => {
    const qs = opts?.limit != null ? `?limit=${opts.limit}` : "";
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

  listUnbilled: async (): Promise<UnbilledLine[]> => {
    return apiRequest<UnbilledLine[]>("/unbilled-lines");
  },
};
