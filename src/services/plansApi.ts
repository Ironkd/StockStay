import { API_BASE_URL } from "../config/api";
import type { PlansConfig } from "../types";

/** Public plan limits for marketing (no auth). */
export async function fetchPlansConfig(): Promise<PlansConfig> {
  const res = await fetch(`${API_BASE_URL}/plans`);
  if (!res.ok) {
    throw new Error("Failed to load plan pricing");
  }
  return res.json();
}
