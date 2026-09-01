"use client";

import {
  saveHireReturnChargesDraftAction,
  type HireReturnChargesPageData,
} from "@/app/actions/hire-return-charges";
import { RphSelect, rphSelectTriggerClass } from "@/components/forms/rph-select";
import type { HireInspectionDamageChargeResolution } from "@/lib/fleet/hire-inspection-damage-charges";
import {
  validateOptionalReturnCharge,
  validateReturnDamageCharges,
} from "@/lib/fleet/hire-return-charges";
import { hireInspectionAccessoryLabel } from "@/lib/fleet/hire-inspection-accessories";
import type { HireInspectionAccessoryKey } from "@/lib/fleet/hire-inspection-accessories";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  getVehicleDamagePanel,
  hireDamageSeverityLabel,
  hireDamageTypeLabel,
  type HireDamageSeverity,
  type HireDamageType,
} from "@/lib/fleet/vehicle-damage-panels";
import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

const DECISION_OPTIONS: { value: OptionalChargeDecision; label: string }[] = [
  { value: "skip", label: "No charge" },
  { value: "charge", label: "Charge" },
  { value: "review_later", label: "Review later" },
];

type OptionalChargeDecision = "skip" | "review_later" | "charge";

type DamageDraft = HireReturnChargesPageData["newDamages"][number];
type AccessoryDraft = {
  key: HireInspectionAccessoryKey;
  decision: OptionalChargeDecision;
  amountGbp: number | null;
  amountInput: string;
};

function formatStoredAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function buildDamageAmountInputs(damages: readonly DamageDraft[]): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const damage of damages) {
    if (
      damage.chargeResolution === "add_to_balance" &&
      damage.chargeGbp != null &&
      damage.chargeGbp > 0
    ) {
      inputs[damage.id] = formatStoredAmount(damage.chargeGbp);
    }
  }
  return inputs;
}

function chargeGbpFromAmountInput(raw: string): number | null {
  return parseAmountInput(raw);
}

type ChargeFindingRow = {
  id: string;
  kind: "damage" | "fuel" | "accessory";
  title: string;
  description: string;
};

export type HireReturnChargesSectionHandle = {
  saveDraft: () => Promise<{ ok: true } | { ok: false; error: string }>;
  canContinue: () => boolean;
};

type Props = {
  hireGroupId: string;
  data: HireReturnChargesPageData;
  readOnly?: boolean;
  embedded?: boolean;
  depositHeldGbp?: number;
  inspectionEvidenceHref?: string;
  onContinueReadyChange?: (ready: boolean) => void;
  onSaved?: () => void;
};

function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function damageDecisionValue(
  resolution: HireInspectionDamageChargeResolution | null,
): OptionalChargeDecision | "" {
  if (resolution == null) return "";
  if (resolution === "waived") return "skip";
  if (resolution === "add_to_balance" || resolution === "paid_now") return "charge";
  if (resolution === "review_later") return "review_later";
  return "";
}

function buildPayload(input: {
  damages: DamageDraft[];
  damageAmountInputs: Record<string, string>;
  fuelDecision: OptionalChargeDecision;
  fuelAmount: string;
  accessories: AccessoryDraft[];
}) {
  return {
    damages: input.damages.map((damage) => ({
      id: damage.id,
      checkoutDamageId: null,
      chargeGbp:
        damage.chargeResolution === "add_to_balance"
          ? chargeGbpFromAmountInput(input.damageAmountInputs[damage.id] ?? "")
          : damage.chargeGbp,
      chargeResolution: damage.chargeResolution,
    })),
    fuel: {
      enabled: input.fuelDecision !== "skip",
      amountGbp: input.fuelDecision === "charge" ? parseAmountInput(input.fuelAmount) : null,
      chargeResolution: (input.fuelDecision === "review_later"
        ? "review_later"
        : input.fuelDecision === "charge"
          ? "add_to_balance"
          : null) as HireInspectionDamageChargeResolution | null,
    },
    accessories: input.accessories.map((accessory) => ({
      key: accessory.key,
      enabled: accessory.decision !== "skip",
      amountGbp:
        accessory.decision === "charge"
          ? chargeGbpFromAmountInput(accessory.amountInput)
          : null,
      chargeResolution: (accessory.decision === "review_later"
        ? "review_later"
        : accessory.decision === "charge"
          ? "add_to_balance"
          : null) as HireInspectionDamageChargeResolution | null,
    })),
  };
}

function ReturnChargesInfoBanner({ inspectionEvidenceHref }: { inspectionEvidenceHref?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-sky-900/50 dark:bg-sky-950/30">
      <div className="flex items-start gap-2.5">
        <svg
          className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
          />
        </svg>
        <div className="min-w-0 text-sm leading-relaxed text-sky-950 dark:text-sky-100">
          <p className="font-semibold">Inspection evidence and financial decisions stay linked.</p>
          <p className="mt-0.5 text-xs text-sky-900 dark:text-sky-200">
            No charge is created until you post this step. Deposit funds are allocated once, on the
            final account.
          </p>
        </div>
      </div>
      {inspectionEvidenceHref ? (
        <Link
          href={inspectionEvidenceHref}
          className="rph-btn-ghost h-10 shrink-0 border border-rph-border bg-rph-raised px-4 text-sm"
        >
          Open inspection evidence
        </Link>
      ) : null}
    </div>
  );
}

function ReturnChargesSummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rph-panel p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-rph-fg">{value}</p>
      <p className="mt-1 text-xs text-rph-fg-secondary">{hint}</p>
    </div>
  );
}

const RETURN_CHARGE_DECISION_SELECT_CLASS = `${rphSelectTriggerClass} h-9 w-full min-w-0 shrink-0 py-0 text-sm`;

function ReturnChargeFindingRow({
  index,
  row,
  readOnly,
  decision,
  amountDisplay,
  amountEditable,
  onDecisionChange,
  onAmountChange,
}: {
  index: number;
  row: ChargeFindingRow;
  readOnly: boolean;
  decision: OptionalChargeDecision | "";
  amountDisplay: string;
  amountEditable: boolean;
  onDecisionChange: (value: OptionalChargeDecision) => void;
  onAmountChange: (value: string) => void;
}) {
  const displayAmount = amountEditable
    ? amountDisplay
    : amountDisplay.trim()
      ? amountDisplay
      : "0.00";

  return (
    <li className="border-b border-rph-border py-2.5 last:border-b-0">
      <div className="flex gap-3 sm:gap-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10.75rem_5.5rem] sm:gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-rph-fg">{row.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-rph-fg-secondary">{row.description}</p>
            </div>
            {readOnly ? (
              <span className="rph-pill w-fit text-xs sm:justify-self-end">
                {DECISION_OPTIONS.find((option) => option.value === decision)?.label ?? "—"}
              </span>
            ) : (
              <RphSelect
                value={decision === "" ? "undecided" : decision}
                onValueChange={(value) => {
                  if (value === "undecided") return;
                  onDecisionChange(value as OptionalChargeDecision);
                }}
                placeholder="Select decision"
                options={[
                  { value: "undecided", label: "Select decision", disabled: true },
                  ...DECISION_OPTIONS,
                ]}
                triggerClassName={RETURN_CHARGE_DECISION_SELECT_CLASS}
                aria-label={`Decision for ${row.title}`}
              />
            )}
            <label className="relative block w-full sm:justify-self-end">
              <span className="sr-only">Amount for {row.title}</span>
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-rph-fg-muted">
                £
              </span>
              <input
                className="rph-input h-9 w-full py-0 pl-6 pr-2 text-right text-sm tabular-nums disabled:bg-rph-page/60"
                inputMode="decimal"
                placeholder="0.00"
                value={displayAmount}
                readOnly={!amountEditable || readOnly}
                disabled={!amountEditable || readOnly}
                onChange={(event) => onAmountChange(event.target.value)}
              />
            </label>
          </div>
        </div>
      </div>
    </li>
  );
}

export const HireReturnChargesSection = forwardRef<HireReturnChargesSectionHandle, Props>(
  function HireReturnChargesSection(
    {
      hireGroupId,
      data,
      readOnly = false,
      embedded = false,
      depositHeldGbp = 0,
      inspectionEvidenceHref,
      onContinueReadyChange,
      onSaved,
    },
    ref,
  ) {
    const [error, setError] = useState<string | null>(null);
    const [reviewConfirmed, setReviewConfirmed] = useState(false);
    const [damages, setDamages] = useState<DamageDraft[]>(() =>
      data.newDamages.map(normalizeDamageDraft),
    );
    const [damageAmountInputs, setDamageAmountInputs] = useState<Record<string, string>>(() =>
      buildDamageAmountInputs(data.newDamages.map(normalizeDamageDraft)),
    );
    const [fuelDecision, setFuelDecision] = useState<OptionalChargeDecision>(() => {
      if (data.appliedFuelCharge) return "charge";
      if (data.fuelReviewLater) return "review_later";
      return "skip";
    });
    const [fuelAmount, setFuelAmount] = useState(
      data.appliedFuelCharge ? String(data.appliedFuelCharge.amountGbp) : "",
    );
    const [accessories, setAccessories] = useState<AccessoryDraft[]>(() =>
      data.missingAccessories.map((key) => accessoryDraftFromData(key, data)),
    );

    const returnChargesSyncKey = `${data.returnChargesDraftSavedAt ?? ""}:${data.returnChargesAppliedAt ?? ""}`;

    useEffect(() => {
      const nextDamages = data.newDamages.map(normalizeDamageDraft);
      setDamages(nextDamages);
      setDamageAmountInputs(buildDamageAmountInputs(nextDamages));
      setFuelDecision(
        data.appliedFuelCharge ? "charge" : data.fuelReviewLater ? "review_later" : "skip",
      );
      setFuelAmount(data.appliedFuelCharge ? formatStoredAmount(data.appliedFuelCharge.amountGbp) : "");
      setAccessories(data.missingAccessories.map((key) => accessoryDraftFromData(key, data)));
      setReviewConfirmed(Boolean(data.returnChargesDraftSavedAt?.trim()));
    }, [returnChargesSyncKey, data]);

    const hasReturnChargeWork =
      data.newDamages.length > 0 || data.fuelShortfall || data.missingAccessories.length > 0;

    const findingRows = useMemo((): ChargeFindingRow[] => {
      const rows: ChargeFindingRow[] = [];
      for (const damage of damages) {
        const panel = getVehicleDamagePanel(damage.panelId);
        rows.push({
          id: damage.id,
          kind: "damage",
          title: `${panel?.label ?? damage.panelId} ${hireDamageTypeLabel(damage.damageType as HireDamageType).toLowerCase()}`.trim(),
          description: `${hireDamageSeverityLabel(damage.severity as HireDamageSeverity)} · new at check-in · evidence attached`,
        });
      }
      if (data.fuelShortfall) {
        rows.push({
          id: "fuel",
          kind: "fuel",
          title: "Fuel shortfall",
          description: `Checkout ${formatHireFuelLevelPercent(data.checkoutFuelLevel)} → return ${formatHireFuelLevelPercent(data.checkinFuelLevel)} · reading evidence linked`,
        });
      }
      for (const accessory of accessories) {
        rows.push({
          id: accessory.key,
          kind: "accessory",
          title: hireInspectionAccessoryLabel(accessory.key),
          description: "Present at checkout, missing at return · evidence attached",
        });
      }
      return rows;
    }, [
      accessories,
      damages,
      data.checkinFuelLevel,
      data.checkoutFuelLevel,
      data.fuelShortfall,
    ]);

    const summary = useMemo(() => {
      let billableGbp = 0;
      let billableCount = 0;
      let noChargeCount = 0;

      for (const damage of damages) {
        if (damage.chargeResolution === "add_to_balance") {
          const amount = chargeGbpFromAmountInput(damageAmountInputs[damage.id] ?? "");
          if (amount && amount > 0) {
            billableGbp += amount;
            billableCount += 1;
          }
        } else if (damage.chargeResolution === "waived") {
          noChargeCount += 1;
        }
      }

      if (fuelDecision === "charge") {
        const amount = parseAmountInput(fuelAmount);
        if (amount && amount > 0) {
          billableGbp += amount;
          billableCount += 1;
        }
      } else if (fuelDecision === "skip") {
        noChargeCount += 1;
      }

      for (const accessory of accessories) {
        if (accessory.decision === "charge") {
          const amount = chargeGbpFromAmountInput(accessory.amountInput);
          if (amount && amount > 0) {
            billableGbp += amount;
            billableCount += 1;
          }
        } else if (accessory.decision === "skip") {
          noChargeCount += 1;
        }
      }

      return {
        billableGbp: Math.round(billableGbp * 100) / 100,
        billableCount,
        noChargeCount,
      };
    }, [accessories, damageAmountInputs, damages, fuelAmount, fuelDecision]);

    const allDecisionsMade = useMemo(() => {
      if (damages.some((damage) => damage.chargeResolution == null)) return false;
      return true;
    }, [damages]);

    const canContinue = useMemo(() => {
      if (!hasReturnChargeWork) return true;
      if (readOnly) return true;
      if (!reviewConfirmed || !allDecisionsMade) return false;

      const payload = buildPayload({ damages, damageAmountInputs, fuelDecision, fuelAmount, accessories });
      if (validateReturnDamageCharges(payload.damages)) return false;
      if (validateOptionalReturnCharge(payload.fuel)) return false;
      for (const accessory of payload.accessories) {
        if (validateOptionalReturnCharge(accessory)) return false;
      }
      return true;
    }, [
      accessories,
      allDecisionsMade,
      damageAmountInputs,
      damages,
      fuelAmount,
      fuelDecision,
      hasReturnChargeWork,
      readOnly,
      reviewConfirmed,
    ]);

    useEffect(() => {
      onContinueReadyChange?.(canContinue);
    }, [canContinue, onContinueReadyChange]);

    async function saveDraft(): Promise<{ ok: true } | { ok: false; error: string }> {
      if (!hasReturnChargeWork) return { ok: true };

      const payload = buildPayload({ damages, damageAmountInputs, fuelDecision, fuelAmount, accessories });
      const damageError = validateReturnDamageCharges(payload.damages);
      if (damageError) return { ok: false, error: damageError };

      const fuelError = validateOptionalReturnCharge(payload.fuel);
      if (fuelError) return { ok: false, error: fuelError };

      for (const accessory of payload.accessories) {
        const accessoryError = validateOptionalReturnCharge(accessory);
        if (accessoryError) {
          return { ok: false, error: `${accessoryError} (${accessory.key})` };
        }
      }

      const res = await saveHireReturnChargesDraftAction(hireGroupId, payload);
      if (!res.ok) return res;
      onSaved?.();
      return { ok: true };
    }

    useImperativeHandle(
      ref,
      () => ({
        saveDraft: async () => {
          setError(null);
          const result = await saveDraft();
          if (!result.ok) setError(result.error);
          return result;
        },
        canContinue: () => canContinue,
      }),
      [canContinue, damages, damageAmountInputs, fuelDecision, fuelAmount, accessories, hireGroupId, hasReturnChargeWork],
    );

    const shellClass = embedded ? "space-y-4" : "space-y-4 rounded-2xl border border-rph-border bg-rph-raised p-4 shadow-sm sm:p-5";

    if (!data.checkinCompleted) {
      return (
        <div className={shellClass}>
          <p className="text-sm text-rph-fg-secondary">
            Complete vehicle check-in before reviewing return charges.
          </p>
        </div>
      );
    }

    if (!hasReturnChargeWork) {
      return (
        <div className={shellClass}>
          <ReturnChargesInfoBanner inspectionEvidenceHref={inspectionEvidenceHref} />
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">
              Nothing to charge from check-in
            </p>
            <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
              No new damage, fuel difference, or missing accessories were recorded. Continue to the
              final account.
            </p>
          </div>
        </div>
      );
    }

    function renderRowControls(row: ChargeFindingRow, index: number) {
      if (row.kind === "damage") {
        const damage = damages.find((item) => item.id === row.id);
        if (!damage) return null;
        const decision = damageDecisionValue(damage.chargeResolution);
        const amountEditable = decision === "charge" && !readOnly;
        const amountDisplay = damageAmountInputs[damage.id] ?? "";

        return (
          <ReturnChargeFindingRow
            key={row.id}
            index={index}
            row={row}
            readOnly={readOnly}
            decision={decision}
            amountDisplay={amountDisplay}
            amountEditable={amountEditable}
            onDecisionChange={(value) => {
              const resolution =
                value === "skip"
                  ? ("waived" as const)
                  : value === "charge"
                    ? ("add_to_balance" as const)
                    : ("review_later" as const);
              setDamages((prev) =>
                prev.map((item) =>
                  item.id === damage.id
                    ? {
                        ...item,
                        chargeResolution: resolution,
                        chargeGbp:
                          resolution === "add_to_balance"
                            ? chargeGbpFromAmountInput(damageAmountInputs[damage.id] ?? "")
                            : null,
                      }
                    : item,
                ),
              );
              if (resolution !== "add_to_balance") {
                setDamageAmountInputs((prev) => {
                  const next = { ...prev };
                  delete next[damage.id];
                  return next;
                });
              }
            }}
            onAmountChange={(value) => {
              setDamageAmountInputs((prev) => ({ ...prev, [damage.id]: value }));
            }}
          />
        );
      }

      if (row.kind === "fuel") {
        const amountEditable = fuelDecision === "charge" && !readOnly;
        return (
          <ReturnChargeFindingRow
            key={row.id}
            index={index}
            row={row}
            readOnly={readOnly}
            decision={fuelDecision}
            amountDisplay={fuelAmount}
            amountEditable={amountEditable}
            onDecisionChange={(value) => {
              setFuelDecision(value);
              if (value !== "charge") setFuelAmount("");
            }}
            onAmountChange={setFuelAmount}
          />
        );
      }

      const accessory = accessories.find((item) => item.key === row.id);
      if (!accessory) return null;
      const amountEditable = accessory.decision === "charge" && !readOnly;

      return (
        <ReturnChargeFindingRow
          key={row.id}
          index={index}
          row={row}
          readOnly={readOnly}
          decision={accessory.decision}
          amountDisplay={accessory.amountInput}
          amountEditable={amountEditable}
          onDecisionChange={(value) => {
            setAccessories((prev) =>
              prev.map((item) =>
                item.key === accessory.key
                  ? {
                      ...item,
                      decision: value,
                      amountGbp:
                        value === "charge"
                          ? chargeGbpFromAmountInput(item.amountInput)
                          : null,
                      amountInput: value === "charge" ? item.amountInput : "",
                    }
                  : item,
              ),
            );
          }}
          onAmountChange={(value) => {
            setAccessories((prev) =>
              prev.map((item) =>
                item.key === accessory.key
                  ? { ...item, amountInput: value, amountGbp: chargeGbpFromAmountInput(value) }
                  : item,
              ),
            );
          }}
        />
      );
    }

    return (
      <div className={shellClass}>
        <ReturnChargesInfoBanner inspectionEvidenceHref={inspectionEvidenceHref} />

        <div className="rph-panel overflow-hidden">
          <div className="border-b border-rph-border px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="driver-dash-section-label">New findings</p>
                <h3 className="mt-0.5 text-base font-semibold tracking-tight text-rph-fg sm:text-lg">
                  Decide what should be charged
                </h3>
                <p className="mt-1.5 text-[11px] leading-snug text-rph-fg-secondary">
                  Pre-existing checkout damage remains read-only and is not shown as a new charge.
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100">
                {findingRows.length} {findingRows.length === 1 ? "decision" : "decisions"}
              </span>
            </div>
          </div>

          {error ? (
            <p className="rph-alert-error mx-4 mt-3 text-sm sm:mx-5">{error}</p>
          ) : null}

          <ol className="px-4 py-1 sm:px-5">
            {findingRows.map((row, index) => renderRowControls(row, index + 1))}
          </ol>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReturnChargesSummaryCard
            label="Billable return charges"
            value={formatGbp(summary.billableGbp)}
            hint={`${summary.billableCount} posted charge ${summary.billableCount === 1 ? "decision" : "decisions"}`}
          />
          <ReturnChargesSummaryCard
            label="No-charge findings"
            value={String(summary.noChargeCount)}
            hint="Reason retained in the audit"
          />
          <ReturnChargesSummaryCard
            label="Collected at check-in"
            value={formatGbp(0)}
            hint="No payment recorded twice"
          />
          <ReturnChargesSummaryCard
            label="Deposit held"
            value={formatGbp(depositHeldGbp)}
            hint="Allocation happens next"
          />
        </div>

        {!readOnly ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rph-border bg-rph-raised px-4 py-3.5 shadow-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-rph-border text-rph-rail focus:ring-rph-rail/30"
              checked={reviewConfirmed}
              onChange={(event) => setReviewConfirmed(event.target.checked)}
            />
            <span className="min-w-0">
              <span className="text-sm font-semibold text-rph-fg">I have reviewed the return charges</span>
              <span className="mt-0.5 block text-xs text-rph-fg-secondary">
                Posting creates audited charge entries and opens the final account.
              </span>
            </span>
          </label>
        ) : null}

        <div className="rounded-xl border border-rph-border bg-rph-raised px-4 py-3.5 shadow-sm">
          <p className="text-sm font-semibold text-rph-fg">Final account remains locked</p>
          <p className="mt-0.5 text-xs text-rph-fg-secondary">
            Confirm the charge decisions before continuing.
          </p>
        </div>
      </div>
    );
  },
);

function normalizeDamageDraft(
  damage: HireReturnChargesPageData["newDamages"][number],
): DamageDraft {
  if (damage.chargeResolution === "paid_now") {
    return { ...damage, chargeResolution: "add_to_balance" };
  }
  return damage;
}

function accessoryDraftFromData(
  key: HireInspectionAccessoryKey,
  data: HireReturnChargesPageData,
): AccessoryDraft {
  const applied = data.appliedAccessoryCharges.find((row) => row.key === key);
  if (applied) {
    return {
      key,
      decision: "charge",
      amountGbp: applied.amountGbp,
      amountInput: formatStoredAmount(applied.amountGbp),
    };
  }
  if (data.accessoryReviewsLater.includes(key)) {
    return { key, decision: "review_later", amountGbp: null, amountInput: "" };
  }
  return { key, decision: "skip", amountGbp: null, amountInput: "" };
}
