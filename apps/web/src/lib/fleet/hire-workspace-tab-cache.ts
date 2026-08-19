/**
 * In-memory hire workspace tab cache policy.
 * Lives on the layout provider (same hire, tab switches). Server actions still
 * authorise every fetch; this only skips repeat reads while the layout is mounted.
 */

export const HIRE_WORKSPACE_CACHE_KEYS = [
  "payments",
  "dashboard",
  "inspectionAttention",
  "details",
  "activity",
  "inspections",
] as const;

export type HireWorkspaceCacheKey = (typeof HIRE_WORKSPACE_CACHE_KEYS)[number];

/** Active hires can receive payment events; ended hires stay on the first load until a mutation. */
export function hireWorkspacePaymentRealtimeEnabled(contractEnded: boolean): boolean {
  return !contractEnded;
}

export function hireWorkspaceKeysInvalidatedByPaymentChange(): HireWorkspaceCacheKey[] {
  return ["payments", "dashboard", "activity"];
}

export function hireWorkspaceKeysInvalidatedByInspectionChange(): HireWorkspaceCacheKey[] {
  return ["inspections", "dashboard", "inspectionAttention", "activity"];
}

export function hireWorkspaceKeysInvalidatedByDetailsChange(): HireWorkspaceCacheKey[] {
  return ["details"];
}
