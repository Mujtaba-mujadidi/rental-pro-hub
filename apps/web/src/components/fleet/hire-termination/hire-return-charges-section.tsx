"use client";

import {
  saveHireReturnChargesDraftAction,
  type HireReturnChargesPageData,
} from "@/app/actions/hire-return-charges";
import type { HireInspectionDamageChargeResolution } from "@/lib/fleet/hire-inspection-damage-charges";
import {
  validateOptionalReturnCharge,
  validateReturnDamageCharges,
  type HireReturnChargeResolution,
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
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

const DECISION_LABELS: Record<HireReturnChargeResolution | "skip", string> = {
  waived: "No charge",
  add_to_balance: "Charge",
  review_later: "Review later",
  skip: "No charge",
};

type OptionalChargeDecision = "skip" | "review_later" | "charge";

type DamageDraft = HireReturnChargesPageData["newDamages"][number];
type AccessoryDraft = {
  key: HireInspectionAccessoryKey;
  decision: OptionalChargeDecision;
  amountGbp: number | null;
};

export type HireReturnChargesSectionHandle = {
  /** Validate and persist draft — called when continuing to the final account step. */
  saveDraft: () => Promise<{ ok: true } | { ok: false; error: string }>;
};

type Props = {
  hireGroupId: string;
  data: HireReturnChargesPageData;
  readOnly?: boolean;
  /** When embedded in the end-hire wizard, omit the outer card chrome. */
  embedded?: boolean;
  onSaved?: () => void;
};

function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function resolutionLabel(value: string | null | undefined): string {
  if (!value) return "Not decided";
  if (value === "add_to_balance" || value === "paid_now") return DECISION_LABELS.add_to_balance;
  if (value === "waived") return DECISION_LABELS.waived;
  if (value === "review_later") return DECISION_LABELS.review_later;
  return value;
}

function buildPayload(input: {
  damages: DamageDraft[];
  fuelDecision: OptionalChargeDecision;
  fuelAmount: string;
  accessories: AccessoryDraft[];
}) {
  return {
    damages: input.damages.map((damage) => ({
      id: damage.id,
      checkoutDamageId: null,
      chargeGbp: damage.chargeGbp,
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
      amountGbp: accessory.decision === "charge" ? accessory.amountGbp : null,
      chargeResolution: (accessory.decision === "review_later"
        ? "review_later"
        : accessory.decision === "charge"
          ? "add_to_balance"
          : null) as HireInspectionDamageChargeResolution | null,
    })),
  };
}

function ReturnChargeDecisionPills({
  value,
  onChange,
  disabled,
  ariaLabel,
  allowUnset = false,
}: {
  value: OptionalChargeDecision | HireReturnChargeResolution | "paid_now" | null;
  onChange: (value: OptionalChargeDecision | HireReturnChargeResolution) => void;
  disabled?: boolean;
  ariaLabel: string;
  allowUnset?: boolean;
}) {
  const options: { value: OptionalChargeDecision; label: string }[] = [
    { value: "skip", label: "No charge" },
    { value: "charge", label: "Charge" },
    { value: "review_later", label: "Review later" },
  ];

  let normalized: OptionalChargeDecision | null;
  if (value == null && allowUnset) {
    normalized = null;
  } else if (value === "waived" || value === "skip") {
    normalized = "skip";
  } else if (value === "add_to_balance" || value === "paid_now") {
    normalized = "charge";
  } else if (value === "review_later") {
    normalized = "review_later";
  } else {
    normalized = allowUnset ? null : "skip";
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = normalized === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            className={active ? "rph-pill-active rph-pill text-xs" : "rph-pill text-xs hover:bg-rph-chrome"}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const HireReturnChargesSection = forwardRef<HireReturnChargesSectionHandle, Props>(
  function HireReturnChargesSection(
    { hireGroupId, data, readOnly = false, embedded = false, onSaved },
    ref,
  ) {
    const [error, setError] = useState<string | null>(null);
    const [damages, setDamages] = useState<DamageDraft[]>(() =>
      data.newDamages.map(normalizeDamageDraft),
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

    useEffect(() => {
      setDamages(data.newDamages.map(normalizeDamageDraft));
      setFuelDecision(
        data.appliedFuelCharge ? "charge" : data.fuelReviewLater ? "review_later" : "skip",
      );
      setFuelAmount(data.appliedFuelCharge ? String(data.appliedFuelCharge.amountGbp) : "");
      setAccessories(data.missingAccessories.map((key) => accessoryDraftFromData(key, data)));
    }, [data]);

    const hasReturnChargeWork =
      data.newDamages.length > 0 || data.fuelShortfall || data.missingAccessories.length > 0;

    const itemCount = useMemo(() => {
      let count = damages.length;
      if (data.fuelShortfall) count += 1;
      count += accessories.length;
      return count;
    }, [accessories.length, damages.length, data.fuelShortfall]);

    async function saveDraft(): Promise<{ ok: true } | { ok: false; error: string }> {
      if (!hasReturnChargeWork) return { ok: true };

      const payload = buildPayload({ damages, fuelDecision, fuelAmount, accessories });
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
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [damages, fuelDecision, fuelAmount, accessories, hireGroupId, hasReturnChargeWork],
    );

    const shellClass = embedded
      ? "space-y-4"
      : "rounded-2xl border border-rph-border bg-rph-raised p-4 shadow-sm sm:p-5";

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

    return (
      <div className={shellClass}>
        {!embedded ? (
          <p className="text-sm text-rph-fg-secondary">
            Choose what to bill from check-in. Charges are added to the balance when you confirm the
            final account — use Review later if you are not ready to price an item.
          </p>
        ) : null}

        <div className="rounded-xl border border-rph-border bg-rph-page/40 px-4 py-3">
          <p className="text-sm font-medium text-rph-fg">
            {itemCount} {itemCount === 1 ? "item" : "items"} from check-in
          </p>
          <p className="mt-1 text-xs text-rph-fg-secondary">
            Decisions are saved when you continue to the final account step.
          </p>
        </div>

        {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

        <div className="space-y-3">
          {damages.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
                New damage
              </h3>
              <ul className="space-y-2">
                {damages.map((damage) => (
                  <li
                    key={damage.id}
                    className="rounded-xl border border-rph-border bg-rph-raised p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-rph-fg">
                          {getVehicleDamagePanel(damage.panelId)?.label ?? damage.panelId}
                        </p>
                        <p className="mt-0.5 text-xs text-rph-fg-secondary">
                          {hireDamageTypeLabel(damage.damageType as HireDamageType)} ·{" "}
                          {hireDamageSeverityLabel(damage.severity as HireDamageSeverity)}
                          {damage.notes ? ` · ${damage.notes}` : ""}
                        </p>
                      </div>
                      {readOnly ? (
                        <span className="rph-pill text-xs">
                          {resolutionLabel(damage.chargeResolution)}
                          {damage.chargeGbp ? ` · ${formatGbp(damage.chargeGbp)}` : ""}
                        </span>
                      ) : null}
                    </div>
                    {!readOnly ? (
                      <div className="mt-3 space-y-3">
                        <ReturnChargeDecisionPills
                          ariaLabel={`Decision for ${damage.panelId}`}
                          value={damage.chargeResolution}
                          allowUnset
                          disabled={readOnly}
                          onChange={(value) => {
                            const resolution =
                              value === "skip"
                                ? ("waived" as const)
                                : value === "charge"
                                  ? ("add_to_balance" as const)
                                  : ("review_later" as const);
                            setDamages((prev) =>
                              prev.map((row) =>
                                row.id === damage.id
                                  ? {
                                      ...row,
                                      chargeResolution: resolution,
                                      chargeGbp:
                                        resolution === "add_to_balance" ? row.chargeGbp : null,
                                    }
                                  : row,
                              ),
                            );
                          }}
                        />
                        {damage.chargeResolution === "add_to_balance" ? (
                          <label className="block max-w-xs space-y-1">
                            <span className="text-xs font-medium text-rph-fg-muted">
                              Amount to add to balance (£)
                            </span>
                            <input
                              className="rph-input w-full"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={
                                damage.chargeGbp != null && damage.chargeGbp > 0
                                  ? String(damage.chargeGbp)
                                  : ""
                              }
                              disabled={readOnly}
                              onChange={(event) => {
                                const amount = parseAmountInput(event.target.value);
                                setDamages((prev) =>
                                  prev.map((row) =>
                                    row.id === damage.id ? { ...row, chargeGbp: amount } : row,
                                  ),
                                );
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.fuelShortfall ? (
            <section className="rounded-xl border border-rph-border bg-rph-raised p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
                Fuel difference
              </h3>
              <p className="mt-1 text-sm text-rph-fg">
                Checkout {formatHireFuelLevelPercent(data.checkoutFuelLevel)} → Return{" "}
                {formatHireFuelLevelPercent(data.checkinFuelLevel)}
              </p>
              {readOnly ? (
                <p className="mt-2 text-sm text-rph-fg-secondary">
                  {data.appliedFuelCharge
                    ? `${resolutionLabel(data.appliedFuelCharge.resolution)} · ${formatGbp(data.appliedFuelCharge.amountGbp)}`
                    : data.fuelReviewLater
                      ? "Marked for later review."
                      : "No charge."}
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <ReturnChargeDecisionPills
                    ariaLabel="Fuel charge decision"
                    value={fuelDecision}
                    disabled={readOnly}
                    onChange={(value) => {
                      const next = value as OptionalChargeDecision;
                      setFuelDecision(next);
                      if (next !== "charge") setFuelAmount("");
                    }}
                  />
                  {fuelDecision === "charge" ? (
                    <label className="block max-w-xs space-y-1">
                      <span className="text-xs font-medium text-rph-fg-muted">
                        Amount to add to balance (£)
                      </span>
                      <input
                        className="rph-input w-full"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={fuelAmount}
                        disabled={readOnly}
                        onChange={(event) => setFuelAmount(event.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          {accessories.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">
                Missing accessories
              </h3>
              <ul className="space-y-2">
                {accessories.map((accessory) => (
                  <li
                    key={accessory.key}
                    className="rounded-xl border border-rph-border bg-rph-raised p-4 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-rph-fg">
                      {hireInspectionAccessoryLabel(accessory.key)}
                    </p>
                    <p className="mt-0.5 text-xs text-rph-fg-secondary">
                      Present at checkout, missing at return
                    </p>
                    {readOnly ? (
                      <p className="mt-2 text-sm text-rph-fg-secondary">
                        {accessory.decision === "charge" && accessory.amountGbp
                          ? `Charge · ${formatGbp(accessory.amountGbp)}`
                          : accessory.decision === "review_later"
                            ? "Marked for later review."
                            : "No charge."}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <ReturnChargeDecisionPills
                          ariaLabel={`${accessory.key} charge decision`}
                          value={accessory.decision}
                          disabled={readOnly}
                          onChange={(value) => {
                            const decision = value as OptionalChargeDecision;
                            setAccessories((prev) =>
                              prev.map((row) =>
                                row.key === accessory.key
                                  ? {
                                      ...row,
                                      decision,
                                      amountGbp: decision === "charge" ? row.amountGbp : null,
                                    }
                                  : row,
                              ),
                            );
                          }}
                        />
                        {accessory.decision === "charge" ? (
                          <label className="block max-w-xs space-y-1">
                            <span className="text-xs font-medium text-rph-fg-muted">
                              Amount to add to balance (£)
                            </span>
                            <input
                              className="rph-input w-full"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={
                                accessory.amountGbp != null && accessory.amountGbp > 0
                                  ? String(accessory.amountGbp)
                                  : ""
                              }
                              disabled={readOnly}
                              onChange={(event) => {
                                const amount = parseAmountInput(event.target.value);
                                setAccessories((prev) =>
                                  prev.map((row) =>
                                    row.key === accessory.key ? { ...row, amountGbp: amount } : row,
                                  ),
                                );
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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
    };
  }
  if (data.accessoryReviewsLater.includes(key)) {
    return { key, decision: "review_later", amountGbp: null };
  }
  return { key, decision: "skip", amountGbp: null };
}
