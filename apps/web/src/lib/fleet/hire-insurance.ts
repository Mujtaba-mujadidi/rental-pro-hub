import { daysFromCalendarDateToExpiry } from "@/lib/datetime/uk";

export const HIRE_INSURANCE_PROVIDED_BY = ["driver", "company"] as const;
export type HireInsuranceProvidedBy = (typeof HIRE_INSURANCE_PROVIDED_BY)[number];

export const HIRE_INSURANCE_TYPES = ["tpo", "tpft", "fully_comprehensive"] as const;
export type HireInsuranceType = (typeof HIRE_INSURANCE_TYPES)[number];

export const HIRE_INSURANCE_PROVIDED_BY_LABELS: Record<HireInsuranceProvidedBy, string> = {
  driver: "Driver",
  company: "Rental company",
};

export const HIRE_INSURANCE_TYPE_LABELS: Record<HireInsuranceType, string> = {
  tpo: "Third-Party Only (TPO)",
  tpft: "Third-Party, Fire and Theft (TPFT)",
  fully_comprehensive: "Fully Comprehensive",
};

export type HireInsuranceDocumentStatus =
  | "not_configured"
  | "awaiting_upload"
  | "on_file"
  | "expiring"
  | "expired";

export function isHireInsuranceProvidedBy(value: string): value is HireInsuranceProvidedBy {
  return (HIRE_INSURANCE_PROVIDED_BY as readonly string[]).includes(value);
}

export function isHireInsuranceType(value: string): value is HireInsuranceType {
  return (HIRE_INSURANCE_TYPES as readonly string[]).includes(value);
}

export function hireInsuranceUploadPartyLabel(providedBy: HireInsuranceProvidedBy): string {
  return providedBy === "driver" ? "the driver" : "your rental company";
}

export function canPartyUploadHireInsurance(input: {
  providedBy: HireInsuranceProvidedBy | null;
  audience: "staff" | "driver";
}): boolean {
  if (!input.providedBy) return false;
  if (input.providedBy === "company") return input.audience === "staff";
  return input.audience === "driver";
}

export function deriveHireInsuranceDocumentStatus(input: {
  providedBy: HireInsuranceProvidedBy | null;
  hasDocument: boolean;
  expiryDate: string | null;
  notifyDaysBefore: number;
  todayYmd: string;
}): HireInsuranceDocumentStatus {
  if (!input.providedBy) return "not_configured";
  if (!input.hasDocument) return "awaiting_upload";

  const daysUntil = daysFromCalendarDateToExpiry(input.expiryDate, input.todayYmd);
  if (daysUntil === null) return "on_file";
  if (daysUntil < 0) return "expired";
  if (daysUntil <= input.notifyDaysBefore) return "expiring";
  return "on_file";
}

export function hireInsuranceAttentionMessage(input: {
  status: HireInsuranceDocumentStatus;
  providedBy: HireInsuranceProvidedBy | null;
  expiryDate: string | null;
  todayYmd: string;
}): string | null {
  if (!input.providedBy) return null;
  if (input.status === "awaiting_upload") {
    return `Insurance certificate required — to be uploaded by ${hireInsuranceUploadPartyLabel(input.providedBy)}.`;
  }
  if (input.status === "expired") {
    return "Hire insurance has expired. Upload a current certificate.";
  }
  if (input.status === "expiring") {
    const daysUntil = daysFromCalendarDateToExpiry(input.expiryDate, input.todayYmd);
    if (daysUntil === null) return "Hire insurance is expiring soon.";
    if (daysUntil === 0) return "Hire insurance expires today.";
    if (daysUntil === 1) return "Hire insurance expires in 1 day.";
    return `Hire insurance expires in ${daysUntil} days.`;
  }
  return null;
}

export function parseHireInsuranceExpiryYmd(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Insurance expiry date is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, error: "Enter a valid expiry date." };
  }
  return { ok: true, value: trimmed };
}

export function mapHireInsuranceSummary(input: {
  providedBy: string | null;
  insuranceRow: {
    insurance_type: string;
    expiry_date: string;
    file_name: string | null;
    file_path?: string | null;
    uploaded_at: string;
    uploaded_by_role: string;
  } | null;
  notifyDaysBefore: number;
  audience: "staff" | "driver";
  todayYmd?: string;
}): {
  providedBy: HireInsuranceProvidedBy | null;
  providedByLabel: string | null;
  insuranceType: HireInsuranceType | null;
  insuranceTypeLabel: string | null;
  expiryDate: string | null;
  fileName: string | null;
  uploadedAtLabel: string | null;
  uploadedByRole: "driver" | "company_staff" | null;
  status: HireInsuranceDocumentStatus;
  attentionMessage: string | null;
  canUpload: boolean;
  hasDocument: boolean;
} {
  const providedBy: HireInsuranceProvidedBy | null =
    input.providedBy && isHireInsuranceProvidedBy(input.providedBy) ? input.providedBy : null;
  const hasDocument = Boolean(
    input.insuranceRow?.file_path?.trim() || input.insuranceRow?.file_name?.trim(),
  );
  const expiryDate = input.insuranceRow?.expiry_date ?? null;
  const todayYmd = input.todayYmd ?? "";
  const status = deriveHireInsuranceDocumentStatus({
    providedBy,
    hasDocument,
    expiryDate,
    notifyDaysBefore: input.notifyDaysBefore,
    todayYmd: todayYmd || "1970-01-01",
  });
  const insuranceType =
    input.insuranceRow && isHireInsuranceType(input.insuranceRow.insurance_type)
      ? input.insuranceRow.insurance_type
      : null;

  return {
    providedBy,
    providedByLabel: providedBy ? HIRE_INSURANCE_PROVIDED_BY_LABELS[providedBy] : null,
    insuranceType,
    insuranceTypeLabel: insuranceType ? HIRE_INSURANCE_TYPE_LABELS[insuranceType] : null,
    expiryDate,
    fileName: input.insuranceRow?.file_name ?? null,
    uploadedAtLabel: input.insuranceRow?.uploaded_at ?? null,
    uploadedByRole:
      input.insuranceRow?.uploaded_by_role === "driver" ||
      input.insuranceRow?.uploaded_by_role === "company_staff"
        ? input.insuranceRow.uploaded_by_role
        : null,
    status,
    attentionMessage: hireInsuranceAttentionMessage({
      status,
      providedBy,
      expiryDate,
      todayYmd: todayYmd || "1970-01-01",
    }),
    canUpload: canPartyUploadHireInsurance({ providedBy, audience: input.audience }),
    hasDocument,
  };
}
