/** True when end date is within notify window (inclusive), comparing UTC dates. */
export function isContractExpiringSoon(
  endDate: string,
  todayIso: string,
  notifyDaysBefore: number,
): boolean {
  if (!endDate || notifyDaysBefore < 0) return false;
  const [ey, em, ed] = endDate.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  if (!ey || !em || !ed || !ty || !tm || !td) return false;

  const endMs = Date.UTC(ey, em - 1, ed);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const windowMs = notifyDaysBefore * 24 * 60 * 60 * 1000;

  return endMs >= todayMs && endMs - todayMs <= windowMs;
}
