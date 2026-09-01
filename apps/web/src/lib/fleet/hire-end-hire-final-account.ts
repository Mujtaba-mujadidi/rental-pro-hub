import { formatUkDateTimeText } from "@/lib/datetime/uk";
import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import type { HireReturnChargesPageData } from "@/app/actions/hire-return-charges";
import type { HireInspectionDamageChargeResolution } from "@/lib/fleet/hire-inspection-damage-charges";
import { hireInspectionAccessoryLabel } from "@/lib/fleet/hire-inspection-accessories";
import type { HireEndHireReturnChargesDraft } from "@/lib/fleet/hire-end-hire";
import {
  buildReturnChargeLineItemDrafts,
  HIRE_RETURN_CHARGE_SOURCE_KINDS,
} from "@/lib/fleet/hire-return-charges";
import { addGbp, roundGbp, subGbp } from "@/lib/fleet/hire-money";
import { formatGbp } from "@/lib/fleet/maintenance";
import type { HireEndHireFinancialReview } from "@/lib/fleet/hire-end-hire-financial";

export type HireEndHireFinalAccountChargeLine = {
  id: string;
  label: string;
  amountGbp: number;
  kind: "rent" | "existing_extra" | "return_charge";
  pending?: boolean;
};

export type HireEndHireFinalAccountStatementRow = {
  id: string;
  sortAt: string;
  dateLabel: string;
  activity: string;
  detail?: string;
  statusLabel: "Posted" | "Approved";
  statusTone: "neutral" | "success";
  categoryLabel: "Charge" | "Payment";
  amountGbp: number;
  signed: boolean;
  balanceGbp: number;
};

export type HireEndHireFinalAccountModel = {
  rentCutoffLabel: string;
  totalFinalChargesGbp: number;
  driverPaymentsReceivedGbp: number;
  depositHeldGbp: number;
  depositRequiredGbp: number;
  depositNeedsDecision: boolean;
  currentDriverBalanceGbp: number;
  balanceBeforeDepositGbp: number;
  pendingReturnChargesGbp: number;
  chargeLines: HireEndHireFinalAccountChargeLine[];
  statementRows: HireEndHireFinalAccountStatementRow[];
};

function returnChargeOverviewLabel(input: {
  sourceKind: string;
  description: string;
  panelLabel?: string;
}): string {
  if (input.sourceKind === "checkin_inspection_fuel") return "Fuel shortfall";
  if (input.sourceKind === "checkin_inspection_accessory") {
    const missingPrefix = "Missing ";
    if (input.description.startsWith(missingPrefix)) {
      return input.description.slice(missingPrefix.length);
    }
    return input.description;
  }
  if (input.panelLabel?.trim()) return input.panelLabel.trim();
  const panelPart = input.description.split(" · ")[0]?.trim();
  return panelPart || input.description;
}

export function buildReturnChargeOverviewLines(
  returnCharges: HireReturnChargesPageData | null,
  returnChargesDraft?: HireEndHireReturnChargesDraft | null,
): HireEndHireFinalAccountChargeLine[] {
  if (!returnCharges && !returnChargesDraft) return [];

  const damageMetaById = new Map(
    (returnCharges?.newDamages ?? []).map((damage) => [damage.id, damage]),
  );

  const damages =
    returnChargesDraft && returnChargesDraft.damages.length > 0
      ? returnChargesDraft.damages.map((draftDamage) => {
          const meta = damageMetaById.get(draftDamage.id);
          return {
            id: draftDamage.id,
            panelId: meta?.panelId ?? draftDamage.id,
            panelLabel: meta?.panelLabel,
            damageType: meta?.damageType ?? "damage",
            severity: meta?.severity ?? "minor",
            checkoutDamageId: draftDamage.checkoutDamageId,
            chargeGbp: draftDamage.chargeGbp ?? meta?.chargeGbp ?? null,
            chargeResolution: (draftDamage.chargeResolution ??
              meta?.chargeResolution ??
              null) as HireInspectionDamageChargeResolution | null,
          };
        })
      : (returnCharges?.newDamages ?? []).map((damage) => ({
          id: damage.id,
          panelId: damage.panelId,
          panelLabel: damage.panelLabel,
          damageType: damage.damageType,
          severity: damage.severity,
          checkoutDamageId: null,
          chargeGbp: damage.chargeGbp,
          chargeResolution: damage.chargeResolution,
        }));

  const fuelDraft = returnChargesDraft?.fuel;
  const fuelFromPage = returnCharges?.appliedFuelCharge;
  const fuel =
    fuelDraft?.enabled && fuelDraft.chargeResolution === "add_to_balance"
      ? {
          enabled: true,
          amountGbp: fuelDraft.amountGbp,
          chargeResolution: "add_to_balance" as const,
          checkoutFuelLevel: returnCharges?.checkoutFuelLevel ?? null,
          checkinFuelLevel: returnCharges?.checkinFuelLevel ?? null,
          checkinInspectionId: returnCharges?.checkinInspectionId ?? "fuel",
        }
      : fuelFromPage && fuelFromPage.resolution === "add_to_balance"
        ? {
            enabled: true,
            amountGbp: fuelFromPage.amountGbp,
            chargeResolution: "add_to_balance" as const,
            checkoutFuelLevel: returnCharges?.checkoutFuelLevel ?? null,
            checkinFuelLevel: returnCharges?.checkinFuelLevel ?? null,
            checkinInspectionId: returnCharges?.checkinInspectionId ?? "fuel",
          }
        : undefined;

  const accessoryDrafts = returnChargesDraft?.accessories ?? [];
  const accessoriesFromPage = returnCharges?.appliedAccessoryCharges ?? [];
  const accessories =
    accessoryDrafts.length > 0
      ? accessoryDrafts
          .filter(
            (accessory) =>
              accessory.enabled && accessory.chargeResolution === "add_to_balance",
          )
          .map((accessory) => ({
            key: accessory.key as Parameters<typeof hireInspectionAccessoryLabel>[0],
            enabled: true,
            amountGbp: accessory.amountGbp,
            chargeResolution: "add_to_balance" as const,
          }))
      : accessoriesFromPage
          .filter((row) => row.resolution === "add_to_balance")
          .map((row) => ({
            key: row.key,
            enabled: true,
            amountGbp: row.amountGbp,
            chargeResolution: "add_to_balance" as const,
          }));

  const drafts = buildReturnChargeLineItemDrafts({
    damages,
    fuel,
    accessories,
  });

  const pending = !returnCharges?.returnChargesAppliedAt?.trim();

  return drafts.map((draft) => ({
    id: `${draft.sourceKind}:${draft.sourceId}`,
    label: returnChargeOverviewLabel({
      sourceKind: draft.sourceKind ?? "",
      description: draft.description ?? "",
      panelLabel: damageMetaById.get(String(draft.sourceId))?.panelLabel,
    }),
    amountGbp: draft.amountGbp,
    kind: "return_charge" as const,
    pending,
  }));
}

export function sumReturnChargeOverviewGbp(lines: readonly HireEndHireFinalAccountChargeLine[]): number {
  return roundGbp(lines.reduce((total, line) => total + line.amountGbp, 0));
}

export function buildHireEndHireFinalAccountModel(input: {
  review: HireEndHireFinancialReview;
  rentCutoffLabel: string;
  returnCharges: HireReturnChargesPageData | null;
  returnChargesDraft?: HireEndHireReturnChargesDraft | null;
  depositHeldGbp: number;
  depositRequiredGbp: number;
  depositNeedsDecision: boolean;
  currentSignedSettlementGbp: number;
  returnChargesApplied: boolean;
}): HireEndHireFinalAccountModel {
  const returnChargeLines = buildReturnChargeOverviewLines(
    input.returnCharges,
    input.returnChargesDraft,
  );
  const pendingReturnChargesGbp = input.returnChargesApplied ? 0 : sumReturnChargeOverviewGbp(returnChargeLines);

  const totalFinalChargesGbp = roundGbp(
    addGbp(
      input.review.rentChargedGbp,
      input.review.extraChargesPostedGbp,
      sumReturnChargeOverviewGbp(returnChargeLines),
    ),
  );
  const driverPaymentsReceivedGbp = roundGbp(
    addGbp(input.review.rentReceivedGbp, input.review.extraChargesReceivedGbp),
  );

  const balanceBeforeDepositGbp = roundGbp(subGbp(totalFinalChargesGbp, driverPaymentsReceivedGbp));

  const chargeLines: HireEndHireFinalAccountChargeLine[] = [
    {
      id: "rent",
      label: "Rent through return time",
      amountGbp: input.review.rentChargedGbp,
      kind: "rent",
    },
    ...(input.review.extraChargesPostedGbp > 0.005
      ? [
          {
            id: "existing-extras",
            label: "Existing posted extra charges",
            amountGbp: input.review.extraChargesPostedGbp,
            kind: "existing_extra" as const,
          },
        ]
      : []),
    ...returnChargeLines,
  ];

  return {
    rentCutoffLabel: input.rentCutoffLabel,
    totalFinalChargesGbp,
    driverPaymentsReceivedGbp,
    depositHeldGbp: input.depositHeldGbp,
    depositRequiredGbp: input.depositRequiredGbp,
    depositNeedsDecision: input.depositNeedsDecision,
    currentDriverBalanceGbp: balanceBeforeDepositGbp,
    balanceBeforeDepositGbp,
    pendingReturnChargesGbp,
    chargeLines,
    statementRows: [],
  };
}

function compactStatementDateLabel(value: string): string {
  const formatted = formatUkDateTimeText(value);
  if (formatted === "—") return formatted;
  return formatted.replace(/\s+\d{4},/, ",");
}

type StatementDraftRow = Omit<HireEndHireFinalAccountStatementRow, "balanceGbp">;

function isReturnChargeSourceKind(sourceKind: string): boolean {
  return (HIRE_RETURN_CHARGE_SOURCE_KINDS as readonly string[]).includes(sourceKind);
}

export function buildHireEndHireFinalAccountStatement(input: {
  review: HireEndHireFinancialReview;
  returnCharges: HireReturnChargesPageData | null;
  returnChargesDraft?: HireEndHireReturnChargesDraft | null;
  returnChargesApplied: boolean;
  returnedAtIso: string;
  driverChargeLineItems: readonly HireDriverChargeWorkspaceRow[];
  extraChargeTimedPayments: readonly { id: string; amountGbp: number; paidAt: string }[];
  settlementBalancePayments: readonly {
    id: string;
    amountGbp: number;
    paidAt: string;
    direction: "received_from_driver" | "paid_to_driver";
    paymentCategory?: string | null;
  }[];
}): HireEndHireFinalAccountStatementRow[] {
  const rows: StatementDraftRow[] = [];

  rows.push({
    id: "final-rent",
    sortAt: input.returnedAtIso,
    dateLabel: compactStatementDateLabel(input.returnedAtIso),
    activity: "Final rent charge",
    statusLabel: "Posted",
    statusTone: "neutral",
    categoryLabel: "Charge",
    amountGbp: input.review.rentChargedGbp,
    signed: true,
  });

  const postedExtras = input.driverChargeLineItems.filter(
    (item) => !isReturnChargeSourceKind(item.sourceKind),
  );
  if (postedExtras.length > 0) {
    const totalExtras = roundGbp(postedExtras.reduce((sum, item) => sum + item.amountGbp, 0));
    const latestExtra = postedExtras.reduce((latest, item) =>
      item.createdAt > latest.createdAt ? item : latest,
    );
    rows.push({
      id: "posted-extras",
      sortAt: latestExtra.createdAt,
      dateLabel: compactStatementDateLabel(latestExtra.createdAt),
      activity: "Posted extra charges",
      detail: "PCN, administration, valet etc.",
      statusLabel: "Posted",
      statusTone: "neutral",
      categoryLabel: "Charge",
      amountGbp: totalExtras,
      signed: true,
    });
  }

  if (input.returnChargesApplied) {
    for (const item of input.driverChargeLineItems.filter((row) => isReturnChargeSourceKind(row.sourceKind))) {
      rows.push({
        id: `charge:${item.id}`,
        sortAt: item.createdAt,
        dateLabel: compactStatementDateLabel(item.createdAt),
        activity: returnChargeOverviewLabel({
          sourceKind: item.sourceKind,
          description: item.description ?? item.chargeTypeLabel,
        }),
        detail:
          item.sourceKind === "checkin_inspection_damage" ? "Inspection evidence linked." : undefined,
        statusLabel: "Posted",
        statusTone: "neutral",
        categoryLabel: "Charge",
        amountGbp: item.amountGbp,
        signed: true,
      });
    }
  } else {
    const draftSavedAt = input.returnCharges?.returnChargesDraftSavedAt ?? input.returnedAtIso;
    for (const line of buildReturnChargeOverviewLines(input.returnCharges, input.returnChargesDraft)) {
      rows.push({
        id: `draft:${line.id}`,
        sortAt: draftSavedAt,
        dateLabel: compactStatementDateLabel(draftSavedAt),
        activity: line.label,
        detail: line.kind === "return_charge" ? "Inspection evidence linked." : undefined,
        statusLabel: "Posted",
        statusTone: "neutral",
        categoryLabel: "Charge",
        amountGbp: line.amountGbp,
        signed: true,
      });
    }
  }

  for (const payment of input.extraChargeTimedPayments) {
    rows.push({
      id: `extra-payment:${payment.id}`,
      sortAt: payment.paidAt,
      dateLabel: compactStatementDateLabel(payment.paidAt),
      activity: "Extra-charge payment received",
      statusLabel: "Approved",
      statusTone: "success",
      categoryLabel: "Payment",
      amountGbp: payment.amountGbp,
      signed: false,
    });
  }

  for (const payment of input.settlementBalancePayments) {
    if (payment.paymentCategory && payment.paymentCategory !== "settlement") continue;
    rows.push({
      id: `settlement-payment:${payment.id}`,
      sortAt: payment.paidAt,
      dateLabel: compactStatementDateLabel(payment.paidAt),
      activity:
        payment.direction === "received_from_driver"
          ? "Rent payment received"
          : "Settlement payment to driver",
      statusLabel: "Approved",
      statusTone: "success",
      categoryLabel: "Payment",
      amountGbp: payment.amountGbp,
      signed: false,
    });
  }

  const ascending = [...rows].sort((a, b) => a.sortAt.localeCompare(b.sortAt));
  let balance = 0;
  const withBalance = ascending.map((row) => {
    balance = row.signed
      ? roundGbp(balance + row.amountGbp)
      : roundGbp(balance - row.amountGbp);
    return { ...row, balanceGbp: balance };
  });

  return withBalance.reverse();
}

export function hireEndHireFinalAccountBalanceLabel(balanceGbp: number): string {
  if (balanceGbp > 0.005) return `Driver owes ${formatGbp(balanceGbp)}`;
  if (balanceGbp < -0.005) return `Company owes ${formatGbp(Math.abs(balanceGbp))}`;
  return "Settled";
}

export function accessoryReturnChargeLabel(key: string): string {
  return hireInspectionAccessoryLabel(key as Parameters<typeof hireInspectionAccessoryLabel>[0]);
}
