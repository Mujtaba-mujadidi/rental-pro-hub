export function clampHireFuelLevelPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function isValidHireFuelLevelPercent(value: number | null | undefined): boolean {
  return value == null || (Number.isInteger(value) && value >= 0 && value <= 100);
}

export function formatHireFuelLevelPercent(value: number | null | undefined): string {
  if (value == null) return "Not recorded";
  return `${value}%`;
}

export function hireFuelLevelSliderStyle(percent: number): { "--fuel-pct": string } {
  return { "--fuel-pct": `${clampHireFuelLevelPercent(percent)}%` };
}
