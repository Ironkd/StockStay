/** Build `?a=1&b=2` from a record of defined values; empty string if none. */
export function toQuery(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === false) continue;
    if (value === true) qs.set(key, "true");
    else qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}
