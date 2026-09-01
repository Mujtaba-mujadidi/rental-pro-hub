/** End hire workspace tab — draft shape, steps, and return reasons. */

import { ukLondonDateTimeToIso } from "@/lib/datetime/uk";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import { HIRE_TERMINATION_RENT_BILLING_MODES } from "@/lib/fleet/hire-termination-billing";

export const HIRE_END_HIRE_STEPS = [
  "return_details",
  "financial_review",
  "checkin",
  "return_charges",
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

export type HireEndHireReturnChargesDraft = {
  damages: Array<{
    id: string;
    checkoutDamageId: string | null;
    chargeGbp: number | null;
    chargeResolution: string | null;
  }>;
  fuel: {
    enabled: boolean;
    amountGbp: number | null;
    chargeResolution: string | null;
  };
  accessories: Array<{
    key: string;
    enabled: boolean;
    amountGbp: number | null;
    chargeResolution: string | null;
  }>;
};

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
  /** Highest step reached in the wizard — preserved when navigating back. */
  furthestStep?: HireEndHireStep;
  /** Saved on return-charges step — committed to balance on final confirm. */
  returnChargesDraft?: HireEndHireReturnChargesDraft | null;
  returnChargesDraftSavedAt?: string | null;
  /** Set when return charges are posted to the hire balance (on final confirm). */
  returnChargesAppliedAt?: string | null;
  /** Optional fuel/accessory items marked review-later (no charge posted yet). */
  pendingReturnReviews?: {
    fuel?: boolean;
    accessories?: string[];
  } | null;
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
  return_charges: "Return charges",
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

/** Keep the highest step the user has reached — never reduce when navigating back. */
export function advanceHireEndHireFurthestStep(
  previousFurthest: HireEndHireStep | undefined,
  step: HireEndHireStep,
): HireEndHireStep {
  const prevIdx = hireEndHireStepIndex(previousFurthest ?? step);
  const stepIdx = hireEndHireStepIndex(step);
  return HIRE_END_HIRE_STEPS[Math.max(prevIdx, stepIdx)];
}

export function hireEndHireFurthestStep(
  draft: HireEndHireDraft,
  context?: {
    status: string;
    checkinCompleted: boolean;
  },
): HireEndHireStep {
  let idx = hireEndHireStepIndex(draft.furthestStep ?? draft.step);
  idx = Math.max(idx, hireEndHireStepIndex(draft.step));
  if (context) {
    if (context.status === "terminated" || context.status === "completed") {
      idx = Math.max(idx, hireEndHireStepIndex("financial_review"));
    }
    if (context.checkinCompleted) {
      idx = Math.max(idx, hireEndHireStepIndex("checkin"));
    }
    if (draft.returnChargesDraftSavedAt?.trim()) {
      idx = Math.max(idx, hireEndHireStepIndex("return_charges"));
    }
    if (draft.finalizedAt?.trim()) {
      idx = Math.max(idx, hireEndHireStepIndex("final_account"));
    }
  }
  return HIRE_END_HIRE_STEPS[idx] ?? draft.step;
}

export function hireEndHireStepNavStatus(
  current: HireEndHireStep,
  furthest: HireEndHireStep,
  step: HireEndHireStep,
): "done" | "active" | "locked" {
  const currentIdx = hireEndHireStepIndex(current);
  const furthestIdx = hireEndHireStepIndex(furthest);
  const stepIdx = hireEndHireStepIndex(step);
  if (stepIdx === currentIdx) return "active";
  if (stepIdx <= furthestIdx) return "done";
  return "locked";
}

export function emptyHireEndHireDraft(nowIso: string, todayYmd: string, timeHm: string): HireEndHireDraft {
  return {
    started: false,
    step: "return_details",
    furthestStep: "return_details",
    returnDateYmd: todayYmd,
    returnTimeHm: timeHm,
    reason: "",
    notes: "",
    rentBillingMode: hireEndHireDefaultRentBillingMode(),
    updatedAt: nowIso,
    finalizedAt: null,
    explicitFinalization: false,
    returnChargesDraft: null,
    returnChargesDraftSavedAt: null,
    returnChargesAppliedAt: null,
    pendingReturnReviews: null,
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
      draft.step === "checkin" ||
      draft.step === "return_charges" ||
      draft.step === "final_account"
        ? "return_details"
        : draft.step;
    return withStep(step);
  }

  if (status === "terminated" || status === "completed") {
    if (checkinCompleted) {
      const step: HireEndHireStep =
        draft.step === "return_charges" || draft.step === "final_account"
          ? draft.step
          : "return_charges";
      return withStep(step);
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
  const furthestStepRaw = typeof row.furthestStep === "string" ? row.furthestStep : step;
  const furthestStep = isHireEndHireStep(furthestStepRaw) ? furthestStepRaw : step;
  const reasonRaw = typeof row.reason === "string" ? row.reason : "";
  const reason =
    reasonRaw === "" || isHireEndHireReturnReason(reasonRaw) ? reasonRaw : ("" as const);
  return {
    started: row.started === true,
    step,
    furthestStep,
    returnDateYmd: typeof row.returnDateYmd === "string" ? row.returnDateYmd : "",
    returnTimeHm: typeof row.returnTimeHm === "string" ? row.returnTimeHm : "",
    reason,
    notes: typeof row.notes === "string" ? row.notes : "",
    rentBillingMode: parseHireEndHireRentBillingMode(row.rentBillingMode),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    finalizedAt: typeof row.finalizedAt === "string" ? row.finalizedAt : null,
    explicitFinalization: row.explicitFinalization === true,
    returnChargesDraft: parseReturnChargesDraft(row.returnChargesDraft),
    returnChargesDraftSavedAt:
      typeof row.returnChargesDraftSavedAt === "string" ? row.returnChargesDraftSavedAt : null,
    returnChargesAppliedAt:
      typeof row.returnChargesAppliedAt === "string" ? row.returnChargesAppliedAt : null,
    pendingReturnReviews: parsePendingReturnReviews(row.pendingReturnReviews),
  };
}

function parseReturnChargesDraft(raw: unknown): HireEndHireReturnChargesDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!Array.isArray(row.damages) || !row.fuel || typeof row.fuel !== "object") return null;
  const fuel = row.fuel as Record<string, unknown>;
  return {
    damages: row.damages
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((damage) => ({
        id: typeof damage.id === "string" ? damage.id : "",
        checkoutDamageId:
          typeof damage.checkoutDamageId === "string" ? damage.checkoutDamageId : null,
        chargeGbp:
          typeof damage.chargeGbp === "number" && Number.isFinite(damage.chargeGbp)
            ? damage.chargeGbp
            : null,
        chargeResolution:
          typeof damage.chargeResolution === "string" ? damage.chargeResolution : null,
      }))
      .filter((damage) => damage.id),
    fuel: {
      enabled: fuel.enabled === true,
      amountGbp:
        typeof fuel.amountGbp === "number" && Number.isFinite(fuel.amountGbp)
          ? fuel.amountGbp
          : null,
      chargeResolution:
        typeof fuel.chargeResolution === "string" ? fuel.chargeResolution : null,
    },
    accessories: Array.isArray(row.accessories)
      ? row.accessories
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((accessory) => ({
            key: typeof accessory.key === "string" ? accessory.key : "",
            enabled: accessory.enabled === true,
            amountGbp:
              typeof accessory.amountGbp === "number" && Number.isFinite(accessory.amountGbp)
                ? accessory.amountGbp
                : null,
            chargeResolution:
              typeof accessory.chargeResolution === "string" ? accessory.chargeResolution : null,
          }))
          .filter((accessory) => accessory.key)
      : [],
  };
}

function parsePendingReturnReviews(
  raw: unknown,
): HireEndHireDraft["pendingReturnReviews"] {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const accessories = Array.isArray(row.accessories)
    ? row.accessories.filter((value): value is string => typeof value === "string")
    : [];
  return {
    fuel: row.fuel === true,
    accessories,
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

/** Final account step — check-in done, return confirmed, return charges applied when required. */
export function canFinalizeHireEndHireProcess(input: {
  status: string;
  checkinCompleted: boolean;
  draft: HireEndHireDraft | null;
  returnChargesReady?: boolean;
}): boolean {
  if (isHireEndHireFinalized({ status: input.status, draft: input.draft })) return false;
  if (input.status !== "terminated" && input.status !== "completed") return false;
  if (!input.checkinCompleted) return false;
  if (!input.draft?.started) return false;
  if (input.draft.step !== "final_account") return false;
  if (input.returnChargesReady === false) return false;
  return true;
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
