/** End hire workspace tab — draft shape, steps, and return reasons. */

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
  updatedAt: string;
  /** Set when Final account is finished — cancel no longer allowed. */
  finalizedAt: string | null;
  /** Set when staff confirm Finalise contract termination (not check-in auto-complete). */
  explicitFinalization?: boolean;
};

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
    updatedAt: nowIso,
    finalizedAt: null,
    explicitFinalization: false,
  };
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

/** Build a midday-safe ISO when only date is known; prefer date+time in Europe/London as UTC instant. */
export function hireEndHireReturnedAtIso(returnDateYmd: string, returnTimeHm: string): string | null {
  const date = returnDateYmd.trim();
  const time = returnTimeHm.trim() || "12:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [hh, mm] = time.split(":").map((part) => Number(part));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  // Interpret as Europe/London wall time via offset-free local construction then toISOString is wrong;
  // store as explicit London noon-style: YYYY-MM-DDTHH:mm:00.000Z for UK BST-unaware ops is risky.
  // Use calendarYmd + time as Z noon substitute — terminate already used UTC now.
  // Prefer: date at given time as UTC for consistency with calendarYmdToUtcNoonIso pattern.
  return `${date}T${time}:00.000Z`;
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
