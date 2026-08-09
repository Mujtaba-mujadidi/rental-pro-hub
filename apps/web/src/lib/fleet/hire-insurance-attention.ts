import type { HireLifecycleAttentionItem } from "@/lib/fleet/hire-lifecycle-attention";
import {
  deriveHireInsuranceDocumentStatus,
  hireInsuranceAttentionMessage,
  type HireInsuranceProvidedBy,
} from "@/lib/fleet/hire-insurance";

export function buildHireInsuranceAttentionItems(input: {
  hireGroupId: string;
  audience: "staff" | "driver";
  providedBy: HireInsuranceProvidedBy | null;
  hasDocument: boolean;
  expiryDate: string | null;
  notifyDaysBefore: number;
  todayYmd: string;
  activeHireStatuses?: readonly string[];
  hireStatus: string;
}): HireLifecycleAttentionItem[] {
  const activeStatuses = input.activeHireStatuses ?? [
    "pending_signature",
    "reserved",
    "active",
    "terminated",
  ];
  if (!activeStatuses.includes(input.hireStatus)) return [];

  const status = deriveHireInsuranceDocumentStatus({
    providedBy: input.providedBy,
    hasDocument: input.hasDocument,
    expiryDate: input.expiryDate,
    notifyDaysBefore: input.notifyDaysBefore,
    todayYmd: input.todayYmd,
  });

  const message = hireInsuranceAttentionMessage({
    status,
    providedBy: input.providedBy,
    expiryDate: input.expiryDate,
    todayYmd: input.todayYmd,
  });
  if (!message) return [];

  const base =
    input.audience === "driver"
      ? `/driver/hires/${input.hireGroupId}`
      : `/rental/hires/${input.hireGroupId}`;

  if (status === "awaiting_upload") {
    return [
      {
        kind: "awaiting_insurance_upload",
        title: input.audience === "driver" ? "Upload hire insurance" : "Hire insurance required",
        detail: message,
        href: `${base}/details`,
      },
    ];
  }

  if (status === "expiring" || status === "expired") {
    return [
      {
        kind: status === "expired" ? "insurance_expired" : "insurance_expiring",
        title: status === "expired" ? "Hire insurance expired" : "Hire insurance expiring",
        detail: message,
        href: `${base}/details`,
      },
    ];
  }

  return [];
}
