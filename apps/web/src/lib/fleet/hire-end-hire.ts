/** End hire workspace tab — draft shape, steps, and return reasons. */

import { ukLondonDateTimeToIso } from "@/lib/datetime/uk";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import { HIRE_TERMINATION_RENT_BILLING_MODES } from "@/lib/fleet/hire-termination-billing";

export const HIRE_END_HIRE_STEPS = [
  "return_details",
  "financial_review",
  "checkin",
  "final_account",
] as const;

export type HireEndHireStep = (typeof HIRE_END_HIRE_STEPS)[number];

export const HIRE_END_HIRE_RETURN_REASONS = [
  "planned_return",
  "early_return",
  "vehicle_replacement",
  "contract_breach",
  "repossession",
  "other",
] as const;

export type HireEndHireReturnReason = (typeof HIRE_END_HIRE_RETURN_REASONS)[number];

export type HireEndHireDraft = {
  started: boolean;
  step: HireEndHireStep;
  returnDateYmd: string;
  returnTimeHm: string;
  reason: HireEndHireReturnReason | "";
  notes: string;
  /** How rent for a partial final week/month is billed at return — chosen on Step 1. */
  rentBillingMode: HireTerminationRentBillingMode;
  updatedAt: string;
  /** Set when Final account is finished — cancel no longer allowed. */
  finalizedAt: string | null;
  /** Set when staff confirm Finalise contract termination (not check-in auto-complete). */
  explicitFinalization?: boolean;
};

export function hireEndHireDefaultRentBillingMode(): HireTerminationRentBillingMode {
  return "end_of_period";
}

export function parseHireEndHireRentBillingMode(value: unknown): HireTerminationRentBillingMode {
  if (
    typeof value === "string" &&
    (HIRE_TERMINATION_RENT_BILLING_MODES as readonly string[]).includes(value)
  ) {
    return value as HireTerminationRentBillingMode;
  }
  return hireEndHireDefaultRentBillingMode();
}

export const HIRE_END_HIRE_STEP_LABELS: Record<HireEndHireStep, string> = {
  return_details: "Return details",
  financial_review: "Financial review",
  checkin: "Vehicle check-in",
  final_account: "Final account",
};

export const HIRE_END_HIRE_RETURN_REASON_OPTIONS: {
  value: HireEndHireReturnReason;
  label: string;
}[] = [
  { value: "planned_return", label: "Planned return" },
  { value: "early_return", label: "Early return" },
  { value: "vehicle_replacement", label: "Vehicle replacement" },
  { value: "contract_breach", label: "Contract breach" },
  { value: "repossession", label: "Repossession" },
  { value: "other", label: "Other" },
];

export function hireEndHireReturnReasonLabel(reason: string): string {
  const found = HIRE_END_HIRE_RETURN_REASON_OPTIONS.find((option) => option.value === reason);
  return found?.label ?? reason;
}

export function isHireEndHireStep(value: string): value is HireEndHireStep {
  return (HIRE_END_HIRE_STEPS as readonly string[]).includes(value);
}

export function isHireEndHireReturnReason(value: string): value is HireEndHireReturnReason {
  return (HIRE_END_HIRE_RETURN_REASONS as readonly string[]).includes(value);
}

export function hireEndHireStepIndex(step: HireEndHireStep): number {
  return HIRE_END_HIRE_STEPS.indexOf(step);
}

export function emptyHireEndHireDraft(nowIso: string, todayYmd: string, timeHm: string): HireEndHireDraft {
  return {
    started: false,
    step: "return_details",
    returnDateYmd: todayYmd,
    returnTimeHm: timeHm,
    reason: "",
    notes: "",
    rentBillingMode: hireEndHireDefaultRentBillingMode(),
    updatedAt: nowIso,
    finalizedAt: null,
    explicitFinalization: false,
  };
}

export function hireEndHireStepNeedsFinancialReview(step: HireEndHireStep): boolean {
  return step === "financial_review" || step === "final_account";
}

/** Map stored draft + hire status to the step the end-hire wizard should show. */
export function resolveEffectiveHireEndHireDraft(input: {
  status: string;
  checkinCompleted: boolean;
  draft: HireEndHireDraft;
  nowIso: string;
}): HireEndHireDraft {
  const { status, checkinCompleted, draft, nowIso } = input;
  const withStep = (step: HireEndHireStep): HireEndHireDraft => ({
    ...draft,
    started: true,
    step,
    updatedAt: draft.updatedAt || nowIso,
  });

  if (status === "ending") {
    const step =
      draft.step === "checkin" || draft.step === "final_account" ? "return_details" : draft.step;
    return withStep(step);
  }

  if (status === "terminated" || status === "completed") {
    if (checkinCompleted) {
      return withStep("final_account");
    }
    const step: HireEndHireStep =
      draft.step === "return_details" ||
      draft.step === "financial_review" ||
      draft.step === "checkin"
        ? draft.step
        : "checkin";
    return withStep(step);
  }

  return draft;
}

export function parseHireEndHireDraft(raw: unknown): HireEndHireDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const step = typeof row.step === "string" && isHireEndHireStep(row.step) ? row.step : null;
  if (!step) return null;
  const reasonRaw = typeof row.reason === "string" ? row.reason : "";
  const reason =
    reasonRaw === "" || isHireEndHireReturnReason(reasonRaw) ? reasonRaw : ("" as const);
  return {
    started: row.started === true,
    step,
    returnDateYmd: typeof row.returnDateYmd === "string" ? row.returnDateYmd : "",
    returnTimeHm: typeof row.returnTimeHm === "string" ? row.returnTimeHm : "",
    reason,
    notes: typeof row.notes === "string" ? row.notes : "",
    rentBillingMode: parseHireEndHireRentBillingMode(row.rentBillingMode),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    finalizedAt: typeof row.finalizedAt === "string" ? row.finalizedAt : null,
    explicitFinalization: row.explicitFinalization === true,
  };
}

/** True once staff explicitly finalised termination on the final account step. */
export function isHireEndHireFinalized(input: {
  status: string;
  draft: HireEndHireDraft | null;
}): boolean {
  return Boolean(input.draft?.finalizedAt && input.draft.explicitFinalization === true);
}

/** Check-in previously auto-set status=completed before explicit finalise — repairable. */
export function isHireEndHireAutoCompletedBeforeFinalisation(input: {
  status: string;
  draft: HireEndHireDraft | null;
  checkinCompleted: boolean;
  terminatedAt?: string | null;
}): boolean {
  if (input.status !== "completed") return false;
  if (!input.checkinCompleted) return false;
  if (!input.terminatedAt && !input.draft?.started) return false;
  if (input.draft?.explicitFinalization === true) return false;
  return true;
}

/** Cancel allowed until contract termination is finalised; reverses terminate + check-in when needed. */
export function canCancelHireEndHireProcess(input: {
  status: string;
  draft: HireEndHireDraft | null;
}): boolean {
  if (isHireEndHireFinalized(input)) return false;
  if (input.status === "ending") return true;
  if (input.status === "terminated") return true;
  if (input.status === "completed") return true;
  return false;
}

/** Final account step — check-in done, return confirmed, not yet finalised. */
export function canFinalizeHireEndHireProcess(input: {
  status: string;
  checkinCompleted: boolean;
  draft: HireEndHireDraft | null;
}): boolean {
  if (isHireEndHireFinalized({ status: input.status, draft: input.draft })) return false;
  if (input.status !== "terminated" && input.status !== "completed") return false;
  if (!input.checkinCompleted) return false;
  if (!input.draft?.started) return false;
  return input.draft.step === "final_account";
}

/** Hire list: still in end-hire closeout — show under Active, not Completed. */
export function isHireListActiveCloseout(input: {
  status: string;
  draft: HireEndHireDraft | null;
  terminatedAt?: string | null;
  checkinCompleted?: boolean;
}): boolean {
  if (isHireEndHireFinalized({ status: input.status, draft: input.draft })) return false;
  if (input.status === "ending") return true;
  if (input.status === "terminated" && Boolean(input.terminatedAt?.trim())) return true;
  return isHireEndHireAutoCompletedBeforeFinalisation({
    status: input.status,
    draft: input.draft,
    checkinCompleted: input.checkinCompleted ?? false,
    terminatedAt: input.terminatedAt,
  });
}

/** Return instant for contract end — always Europe/London wall date and time from staff input. */
export function hireEndHireReturnedAtIso(returnDateYmd: string, returnTimeHm: string): string | null {
  const time = returnTimeHm.trim() || "12:00";
  return ukLondonDateTimeToIso(returnDateYmd, time);
}

export function hireEndHireTabVisible(input: {
  status: string;
  canWrite: boolean;
  checkinCompleted: boolean;
  hasOpenSettlement: boolean;
}): boolean {
  if (!input.canWrite) return false;
  if (input.status === "active" || input.status === "ending") return true;
  if (input.status === "terminated") return true;
  if (input.status === "completed" && input.hasOpenSettlement) return true;
  return false;
}
