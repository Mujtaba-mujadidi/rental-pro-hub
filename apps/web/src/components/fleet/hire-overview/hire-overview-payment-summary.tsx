"use client";

import { formatUkDate } from "@/lib/datetime/uk";
import { buildActiveHireAccountPosition } from "@/lib/fleet/hire-account-adapters";
import { buildHireAccountPositionFromTerminationSummary } from "@/lib/fleet/hire-account-position";
import { roundGbp } from "@/lib/fleet/hire-money";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";
import { hireTerminationRentBillingDetail } from "@/lib/fleet/hire-termination-billing";
import {
  formatHireDurationWeeksAndDays,
  hireProRataRentAdjustmentGbp,
  rentCadencePluralLabel,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import { formatGbp } from "@/lib/fleet/maintenance";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-rph-border bg-rph-chrome/30 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-rph-fg-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-rph-fg">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-rph-fg-muted">{hint}</p> : null}
    </div>
  );
}

function EndedContractPaymentSummary({
  summary,
  terminationSummary,
  depositReceivedGbp,
}: {
  summary: HirePaymentSummary;
  terminationSummary: HireTerminationAccountsSummary;
  depositReceivedGbp: number;
}) {
  const account = buildHireAccountPositionFromTerminationSummary(terminationSummary, {
    depositDisposition: "hold_pending",
    depositReceivedGbp,
    lifecycle: "ended",
  });
  // Rent card: schedule paid vs due — deposit apply shown via account when disposition applied later.
  const rentDueGbp = account.rentChargedGbp;
  const rentPaidGbp = roundGbp(summary.totalPaidGbp);
  const balanceGbp = account.rentOutstandingGbp;
  const creditGbp = roundGbp(Math.max(0, rentPaidGbp - rentDueGbp));
  const balanceValue =
    balanceGbp > 0.005
      ? formatGbp(balanceGbp)
      : creditGbp > 0.005
        ? formatGbp(creditGbp)
        : formatGbp(0);
  const balanceLabel =
    balanceGbp > 0.005 ? "Still owed" : creditGbp > 0.005 ? "Rent credit" : "Balance";

  const fullPeriodRentGbp = roundGbp(
    summary.rentGrossAccruedGbp - summary.totalDiscountGbp,
  );
  const proRataAdjustmentGbp = hireProRataRentAdjustmentGbp({
    rentGrossAccruedGbp: summary.rentGrossAccruedGbp,
    totalDiscountGbp: summary.totalDiscountGbp,
    accruedRentDueGbp: rentDueGbp,
  });
  const hasDiscount = summary.totalDiscountGbp > 0.005;
  const hasProRata = proRataAdjustmentGbp > 0.005;

  const durationLabel = formatHireDurationWeeksAndDays(terminationSummary.durationDays);
  const periodsLabel = rentCadencePluralLabel(terminationSummary.rentCadence);
  const durationHint = `${terminationSummary.billedPeriods} ${periodsLabel} rent period${
    terminationSummary.billedPeriods === 1 ? "" : "s"
  } started`;

  const partialPeriodHint = hireTerminationRentBillingDetail(
    terminationSummary.rentBillingMode,
    terminationSummary.rentCadence,
    terminationSummary.billingPeriodBreakdown,
  );

  return (
    <section className="rph-card p-4">
      <h2 className="text-sm font-semibold text-rph-fg">Payment summary</h2>
      <p className="rph-muted mt-1 text-xs">
        Rent for the time the vehicle was on hire (deposit not included). Partial final periods are
        charged pro-rata — not as a discount.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Time on hire" value={durationLabel} hint={durationHint} />
        <Stat
          label="Rent at full period rates"
          value={formatGbp(fullPeriodRentGbp)}
          hint={`Before pro-rata on any partial ${terminationSummary.rentCadence === "weekly" ? "week" : terminationSummary.rentCadence === "monthly" ? "month" : "day"}`}
        />
        {hasProRata ? (
          <Stat
            label="Pro-rata adjustment"
            value={`−${formatGbp(proRataAdjustmentGbp)}`}
            hint={
              partialPeriodHint ??
              "Final billing period charged only for days the vehicle was on hire"
            }
          />
        ) : null}
        {hasDiscount ? (
          <Stat label="Discount" value={formatGbp(summary.totalDiscountGbp)} />
        ) : null}
        <Stat label="Rent due for contract" value={formatGbp(rentDueGbp)} />
        <Stat label="Paid" value={formatGbp(rentPaidGbp)} />
        <Stat label={balanceLabel} value={balanceValue} />
      </div>
    </section>
  );
}

export function HireOverviewPaymentSummary({
  summary,
  contractEnded,
  terminationSummary,
  depositReceivedGbp = 0,
}: {
  summary: HirePaymentSummary;
  contractEnded: boolean;
  terminationSummary?: HireTerminationAccountsSummary | null;
  /** Actual deposit cash received (may be less than contractual). */
  depositReceivedGbp?: number;
}) {
  if (contractEnded && terminationSummary) {
    return (
      <EndedContractPaymentSummary
        summary={summary}
        terminationSummary={terminationSummary}
        depositReceivedGbp={depositReceivedGbp}
      />
    );
  }

  const rentDueGbp = summary.totalDueGbp;
  const rentPaidGbp = summary.totalPaidGbp;
  const account = buildActiveHireAccountPosition({
    depositRequiredGbp: 0,
    depositReceivedGbp: 0,
    rentChargedAfterDiscountGbp: rentDueGbp,
    rentPaidConfirmedGbp: rentPaidGbp,
    extraChargesOutstandingGbp: 0,
  });
  const balanceGbp = account.rentOutstandingGbp;
  const creditGbp = roundGbp(Math.max(0, rentPaidGbp - rentDueGbp));
  const balanceValue =
    balanceGbp > 0.005
      ? formatGbp(balanceGbp)
      : creditGbp > 0.005
        ? formatGbp(creditGbp)
        : formatGbp(0);
  const balanceLabel =
    balanceGbp > 0.005 ? "Still owed" : creditGbp > 0.005 ? "Rent credit" : "Balance";

  const nextPayment = !summary.nextDue
    ? "—"
    : `${formatGbp(summary.nextDue.amountGbp)} · ${formatUkDate(summary.nextDue.periodStart)}`;

  return (
    <section className="rph-card p-4">
      <h2 className="text-sm font-semibold text-rph-fg">Payment summary</h2>
      <p className="rph-muted mt-1 text-xs">
        Totals for rent weeks that have started so far (deposit not included).
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Rent (before discount)" value={formatGbp(summary.rentGrossAccruedGbp)} />
        <Stat label="Discount so far" value={formatGbp(summary.totalDiscountGbp)} />
        <Stat label="Rent after discount (so far)" value={formatGbp(rentDueGbp)} />
        <Stat label="Paid" value={formatGbp(rentPaidGbp)} />
        <Stat label={balanceLabel} value={balanceValue} />
        <Stat label="Next payment" value={nextPayment} />
      </div>
    </section>
  );
}
