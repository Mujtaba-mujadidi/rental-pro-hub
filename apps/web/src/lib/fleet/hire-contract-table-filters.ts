import { hireGroupTableStatus } from "@/lib/fleet/hire-contract-table-display";
import type { HireGroupStatus } from "@/lib/fleet/hire-types";

/** Statuses shown in the hires list (cancelled contracts are excluded server-side). */
export const HIRE_CONTRACT_FILTERABLE_STATUSES = [
  "draft",
  "pending_signature",
  "reserved",
  "active",
  "terminated",
  "completed",
] as const satisfies readonly HireGroupStatus[];

export type HireContractStatusFilter = "all" | (typeof HIRE_CONTRACT_FILTERABLE_STATUSES)[number];

/** One option per hire status — labels match the Status column in the hires table. */
export const HIRE_CONTRACT_STATUS_FILTER_OPTIONS: {
  value: HireContractStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All statuses" },
  ...HIRE_CONTRACT_FILTERABLE_STATUSES.map((status) => ({
    value: status,
    label: hireGroupTableStatus(status).label,
  })),
];

export const HIRE_CONTRACT_PAGE_SIZES = [10, 25, 50, 100] as const;

export function hireContractMatchesStatusFilter(
  status: string,
  filter: HireContractStatusFilter,
): boolean {
  if (filter === "all") return true;
  return status === filter;
}
