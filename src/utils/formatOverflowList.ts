/** "Garden, Kitchen +1 more" — shows up to maxShown leading names. */
export function formatOverflowList(names: string[], maxShown: number): string {
  if (names.length === 0) return "";
  const limit = Math.max(1, Math.min(maxShown, names.length));
  const shown = names.slice(0, limit);
  const rest = names.length - shown.length;
  if (rest <= 0) return shown.join(", ");
  return `${shown.join(", ")} +${rest} more`;
}
