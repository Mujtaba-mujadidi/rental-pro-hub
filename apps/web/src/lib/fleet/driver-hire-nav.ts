import type { HireGroupStatus } from "@/lib/fleet/hire-types";
import type { HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import type { DriverHireSigningPhase } from "@/lib/fleet/driver-hire-request-display";

/** Hire groups shown on the driver "My hire" page and nav item. */
export const DRIVER_CURRENT_HIRE_STATUSES = ["reserved", "active"] as const satisfies readonly HireGroupStatus[];

export type DriverCurrentHireStatus = (typeof DRIVER_CURRENT_HIRE_STATUSES)[number];

/** Ended hires shown on driver hire history. */
export const DRIVER_HIRE_HISTORY_STATUSES = [
  "completed",
  "terminated",
  "cancelled",
] as const satisfies readonly HireGroupStatus[];

export type DriverHireHistoryStatus = (typeof DRIVER_HIRE_HISTORY_STATUSES)[number];

export function isDriverCurrentHireStatus(status: string): status is DriverCurrentHireStatus {
  return (DRIVER_CURRENT_HIRE_STATUSES as readonly string[]).includes(status);
}

export function isDriverHireHistoryStatus(status: string): status is DriverHireHistoryStatus {
  return (DRIVER_HIRE_HISTORY_STATUSES as readonly string[]).includes(status);
}

/** Drivers may view/download vehicle compliance documents only during an ongoing hire. */
export function driverCanAccessVehicleDocuments(hireStatus: string): boolean {
  return isDriverCurrentHireStatus(hireStatus);
}

const DRIVER_HIRE_STATUS_LABELS: Record<string, string> = {
  reserved: "Reserved",
  active: "On rent",
  completed: "Completed",
  terminated: "Terminated",
  cancelled: "Cancelled",
};

export function driverHireStatusLabel(status: string): string {
  return DRIVER_HIRE_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function driverHireStatusTone(status: string): HireTableStatusTone {
  if (status === "active") return "success";
  if (status === "reserved") return "pending";
  if (status === "completed") return "neutral";
  if (status === "terminated" || status === "cancelled") return "warning";
  return "neutral";
}

export type DriverHireDocumentsFrom = "hire-requests" | "my-hire" | "hire-history";

export function driverHireDocumentsPath(
  hireGroupId: string,
  from: DriverHireDocumentsFrom = "hire-requests",
): string {
  const base = `/driver/hire-requests/${hireGroupId}/documents`;
  return from === "hire-requests" ? base : `${base}?from=${from}`;
}

export function driverHireDocumentsBackLink(from: string | null | undefined): {
  href: string;
  label: string;
} {
  if (from === "my-hire") return { href: "/driver/my-hire", label: "My hire" };
  if (from === "hire-history") return { href: "/driver/hire-history", label: "Hire history" };
  return { href: "/driver/hire-requests", label: "Hire requests" };
}

/** Fully signed current hires belong on My hire, not the requests inbox. */
export function shouldHideHireRequestFromInbox(input: {
  signingPhase: DriverHireSigningPhase;
  hireGroupStatus: string | null;
}): boolean {
  return (
    input.signingPhase === "fully_signed" &&
    input.hireGroupStatus !== null &&
    isDriverCurrentHireStatus(input.hireGroupStatus)
  );
}
