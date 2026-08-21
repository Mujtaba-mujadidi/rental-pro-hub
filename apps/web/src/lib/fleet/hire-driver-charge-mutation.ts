import { parseUkDate } from "@/lib/validation/driver-signup";
import {
  hireDriverChargeTypeLabel,
  type HireDriverChargeType,
} from "@/lib/fleet/hire-driver-charges";

const CHARGE_ALLOWED_HIRE_STATUSES = new Set(["active", "terminated", "completed"]);

export type StaffManualChargeAction = "add" | "amend" | "void";

export function staffManualChargeMutationBlock(input: {
  canWriteRentals: boolean;
  hireStatus: string;
  settlementDirection: string | null;
  action: StaffManualChargeAction;
  sourceKind?: string | null;
  balancePaymentId?: string | null;
}): string | null {
  if (!input.canWriteRentals) {
    return "You do not have permission.";
  }
  if (!CHARGE_ALLOWED_HIRE_STATUSES.has(input.hireStatus)) {
    return "Extra charges can only be recorded on an active or ended hire.";
  }
  const ended = input.hireStatus === "terminated" || input.hireStatus === "completed";
  if (ended && input.settlementDirection === "settled") {
    return "This hire is settled. Extra charges cannot be changed.";
  }
  if (input.action === "add") return null;
  if (input.sourceKind !== "staff_manual") {
    return "Check-in damage charges cannot be edited here.";
  }
  if (input.balancePaymentId) {
    return "This charge is tied to a recorded payment and cannot be edited.";
  }
  return null;
}

export function parseStaffManualChargeAmountGbp(value: number): number | null {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

/** Manual extra charges — rent and deposit are handled elsewhere on the hire. */
export const STAFF_MANUAL_CHARGE_TYPES = [
  "damage",
  "administration",
  "other",
] as const satisfies readonly HireDriverChargeType[];

export type StaffManualChargeType = (typeof STAFF_MANUAL_CHARGE_TYPES)[number];

export function isStaffManualChargeType(value: string): value is StaffManualChargeType {
  return (STAFF_MANUAL_CHARGE_TYPES as readonly string[]).includes(value);
}

export function parseStaffManualChargeType(value: string): StaffManualChargeType | null {
  const trimmed = value.trim();
  if (!isStaffManualChargeType(trimmed)) return null;
  return trimmed;
}

export function parseStaffManualChargeDateYmd(value: string): string | null {
  const trimmed = value.trim();
  if (!parseUkDate(trimmed)) return null;
  return trimmed;
}

export function parseStaffManualChargeDescription(value: string): string | null {
  const description = value.trim();
  if (!description) return null;
  return description;
}

export function parseStaffManualChargeReason(value: string): string | null {
  const reason = value.trim();
  if (!reason) return null;
  return reason;
}

export function parseStaffManualChargeFields(input: {
  amountGbp: number;
  chargeType: string;
  chargedOnYmd: string;
  description: string;
  reason?: string | null;
  requireReason: boolean;
}):
  | {
      ok: true;
      data: {
        amountGbp: number;
        chargeType: StaffManualChargeType;
        chargedOnYmd: string;
        description: string;
        reason: string | null;
      };
    }
  | { ok: false; error: string } {
  const amountGbp = parseStaffManualChargeAmountGbp(input.amountGbp);
  if (amountGbp == null) return { ok: false, error: "Enter a valid charge amount." };
  const chargeType = parseStaffManualChargeType(input.chargeType);
  if (!chargeType) return { ok: false, error: "Choose a charge type." };
  const chargedOnYmd = parseStaffManualChargeDateYmd(input.chargedOnYmd);
  if (!chargedOnYmd) return { ok: false, error: "Enter a valid charge date." };
  const description = parseStaffManualChargeDescription(input.description);
  if (!description) return { ok: false, error: "Enter a description for this charge." };
  let reason: string | null = null;
  if (input.requireReason) {
    reason = parseStaffManualChargeReason(input.reason ?? "");
    if (!reason) return { ok: false, error: "Enter a reason for this change." };
  }
  return { ok: true, data: { amountGbp, chargeType, chargedOnYmd, description, reason } };
}

export const STAFF_MANUAL_CHARGE_TYPE_OPTIONS: { value: StaffManualChargeType; label: string }[] =
  STAFF_MANUAL_CHARGE_TYPES.map((value) => ({
    value,
    label: hireDriverChargeTypeLabel(value),
  }));

/** Store a calendar day as a midday UTC instant so the UK date does not shift. */
export function calendarYmdToUtcNoonIso(ymd: string): string {
  return `${ymd.trim()}T12:00:00.000Z`;
}
