import { formatUkDateAtTime } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";
import { addGbp, clampNonNegativeGbp, roundGbp, subGbp } from "@/lib/fleet/hire-money";
import type { HirePaymentStatus } from "@/lib/fleet/hire-types";

export type HireEndHireFinancialLine = {
  id: string;
  label: string;
  amountGbp: number;
  signed: boolean;
  /** Informational only — awaiting company approval; does not reduce balance. */
  pendingApproval?: boolean;
};

export type HireEndHireCategoryCard = {
  id: "rent" | "extra_charges" | "deposit";
  title: string;
  chargedGbp: number;
  receivedGbp: number;
  /** Driver submissions waiting for company approval (not counted as received). */
  pendingApprovalGbp: number;
  /** Amount still outstanding on this category after approved payments. */
  balanceGbp: number;
  hint: string;
};

export type HireEndHireAccountSection = {
  id: "rent" | "extra_charges" | "deposit";
  title: string;
  lines: HireEndHireFinancialLine[];
};

export type HireEndHirePositionDirection =
  | "driver_owes_company"
  | "company_owes_driver"
  | "settled";

export type HireEndHirePendingApprovalItem = {
  id: string;
  kind: "rent" | "deposit" | "extra_charges";
  label: string;
  submittedGbp: number;
  dueGbp?: number;
  paidGbp?: number;
  balanceGbp?: number;
  paymentReference?: string | null;
  /** Schedule row id for rent/deposit approve actions. */
  scheduleRowId?: string;
};

export type HireEndHireFinancialReview = {
  rentChargedGbp: number;
  rentChargedHint: string;
  rentReceivedGbp: number;
  rentReceivedHint: string;
  depositRequiredGbp: number;
  depositReceivedGbp: number;
  depositUnpaid: boolean;
  depositRequiredGbpLabel: string;
  /** Posted billable extras (add_to_balance + paid_now; not voided/waived). */
  extraChargesPostedGbp: number;
  /** Confirmed receipts against extras (approved payments + paid_now). */
  extraChargesReceivedGbp: number;
  /** Still owed on extras after approved payments. */
  extraChargesOutstandingGbp: number;
  extraChargesHint: string;
  pendingRentGbp: number;
  pendingExtraChargesGbp: number;
  pendingDepositGbp: number;
  /** Sum of all categories awaiting approval. */
  pendingApprovalTotalGbp: number;
  /** Individual driver submissions awaiting company approval. */
  pendingApprovalItems: HireEndHirePendingApprovalItem[];
  /** Absolute amount of the pre-check-in position (excludes unpaid deposit). */
  owedBeforeCheckinGbp: number;
  positionDirection: HireEndHirePositionDirection;
  positionLabel: string;
  categories: HireEndHireCategoryCard[];
  accountSections: HireEndHireAccountSection[];
  /** Flat ledger lines for exports / legacy consumers. */
  lines: HireEndHireFinancialLine[];
};

function categoryBalanceHint(
  chargedGbp: number,
  receivedGbp: number,
  balanceGbp: number,
  pendingApprovalGbp: number,
): string {
  if (chargedGbp <= 0.005 && receivedGbp <= 0.005 && pendingApprovalGbp <= 0.005) {
    return "Nothing posted";
  }
  const parts: string[] = [];
  if (balanceGbp <= 0.005) {
    if (receivedGbp - chargedGbp > 0.005) {
      parts.push(`Overpaid by ${formatGbp(subGbp(receivedGbp, chargedGbp))}`);
    } else {
      parts.push("Fully paid");
    }
  } else if (receivedGbp > 0.005) {
    parts.push(`${formatGbp(receivedGbp)} of ${formatGbp(chargedGbp)} received`);
  } else {
    parts.push("Nothing received yet");
  }
  if (pendingApprovalGbp > 0.005) {
    parts.push(`${formatGbp(pendingApprovalGbp)} pending approval`);
  }
  return parts.join(" · ");
}

function pushPendingLine(
  lines: HireEndHireFinancialLine[],
  id: string,
  label: string,
  amountGbp: number,
) {
  if (amountGbp <= 0.005) return;
  lines.push({
    id,
    label,
    amountGbp,
    signed: false,
    pendingApproval: true,
  });
}

function pendingLineLabel(item: HireEndHirePendingApprovalItem): string {
  return `${item.label}: ${formatGbp(item.submittedGbp)} submitted for approval`;
}

function pushPendingItems(
  lines: HireEndHireFinancialLine[],
  items: readonly HireEndHirePendingApprovalItem[],
  kind: HireEndHirePendingApprovalItem["kind"],
) {
  for (const item of items) {
    if (item.kind !== kind || item.submittedGbp <= 0.005) continue;
    pushPendingLine(lines, `pending_${item.id}`, pendingLineLabel(item), item.submittedGbp);
  }
}

export function buildHireEndHirePendingApprovalItems(input: {
  scheduleRows: readonly {
    id: string;
    rowKind: "rent" | "deposit";
    periodLabel: string;
    paymentStatus: HirePaymentStatus;
    pendingSubmittedGbp: number | null;
    netDueGbp: number;
    paidGbp: number;
    balanceGbp: number;
  }[];
  pendingAmountForRow: (row: {
    paymentStatus: HirePaymentStatus;
    pendingSubmittedGbp: number | null;
    balanceGbp: number;
  }) => number;
  extraChargePending?: {
    submissionId: string;
    amountGbp: number;
    paymentReference: string | null;
  } | null;
  extraChargesOutstandingGbp?: number;
}): HireEndHirePendingApprovalItem[] {
  const items: HireEndHirePendingApprovalItem[] = [];
  for (const row of input.scheduleRows) {
    if (row.paymentStatus !== "pending_approval") continue;
    const submittedGbp = input.pendingAmountForRow(row);
    if (submittedGbp <= 0.005) continue;
    items.push({
      id: row.id,
      kind: row.rowKind,
      label: row.periodLabel,
      submittedGbp,
      dueGbp: row.netDueGbp,
      paidGbp: row.paidGbp,
      balanceGbp: row.balanceGbp,
      scheduleRowId: row.id,
    });
  }
  if (input.extraChargePending && input.extraChargePending.amountGbp > 0.005) {
    items.push({
      id: input.extraChargePending.submissionId,
      kind: "extra_charges",
      label: "Extra charges",
      submittedGbp: roundGbp(input.extraChargePending.amountGbp),
      balanceGbp: input.extraChargesOutstandingGbp,
      paymentReference: input.extraChargePending.paymentReference,
    });
  }
  return items;
}

export function sumPendingApprovalByKind(
  items: readonly HireEndHirePendingApprovalItem[],
  kind: HireEndHirePendingApprovalItem["kind"],
): number {
  return roundGbp(
    items.reduce((sum, item) => (item.kind === kind ? addGbp(sum, item.submittedGbp) : sum), 0),
  );
}

export function buildHireEndHireFinancialReview(input: {
  returnDateYmd: string;
  returnTimeHm: string;
  rentChargedGbp: number;
  rentDaysHint?: string | null;
  rentReceivedGbp: number;
  depositRequiredGbp: number;
  depositReceivedGbp: number;
  extraCharges: readonly {
    id: string;
    chargeType: string;
    chargeTypeLabel?: string;
    description: string | null;
    amountGbp: number;
    resolution: string;
  }[];
  /**
   * Authoritative outstanding after approved `driver_charge` receipts
   * (same figure as Payments). When omitted, falls back to unpaid add_to_balance totals.
   */
  extraChargesOutstandingGbp?: number;
  /** Driver rent/deposit schedule submissions awaiting approval. */
  pendingRentGbp?: number;
  pendingDepositGbp?: number;
  pendingExtraChargesGbp?: number;
  pendingApprovalItems?: readonly HireEndHirePendingApprovalItem[];
}): HireEndHireFinancialReview {
  const rentChargedGbp = clampNonNegativeGbp(input.rentChargedGbp);
  const rentReceivedGbp = clampNonNegativeGbp(input.rentReceivedGbp);
  const depositRequiredGbp = clampNonNegativeGbp(input.depositRequiredGbp);
  const depositReceivedGbp = clampNonNegativeGbp(input.depositReceivedGbp);
  const pendingRentGbp = clampNonNegativeGbp(
    input.pendingApprovalItems?.length
      ? sumPendingApprovalByKind(input.pendingApprovalItems, "rent")
      : (input.pendingRentGbp ?? 0),
  );
  const pendingDepositGbp = clampNonNegativeGbp(
    input.pendingApprovalItems?.length
      ? sumPendingApprovalByKind(input.pendingApprovalItems, "deposit")
      : (input.pendingDepositGbp ?? 0),
  );
  const pendingExtraChargesGbp = clampNonNegativeGbp(
    input.pendingApprovalItems?.length
      ? sumPendingApprovalByKind(input.pendingApprovalItems, "extra_charges")
      : (input.pendingExtraChargesGbp ?? 0),
  );
  const pendingApprovalItems = input.pendingApprovalItems ?? [];
  const pendingApprovalTotalGbp = roundGbp(
    addGbp(pendingRentGbp, pendingDepositGbp, pendingExtraChargesGbp),
  );

  let extrasPosted = 0;
  let addToBalancePosted = 0;
  for (const charge of input.extraCharges) {
    if (charge.resolution === "voided" || charge.resolution === "waived") continue;
    const amount = clampNonNegativeGbp(charge.amountGbp);
    if (amount <= 0.005) continue;
    extrasPosted = addGbp(extrasPosted, amount);
    if (charge.resolution === "add_to_balance") {
      addToBalancePosted = addGbp(addToBalancePosted, amount);
    }
  }

  const extrasOutstanding =
    input.extraChargesOutstandingGbp != null
      ? clampNonNegativeGbp(input.extraChargesOutstandingGbp)
      : addToBalancePosted;
  const extrasReceived = clampNonNegativeGbp(subGbp(extrasPosted, extrasOutstanding));

  const rentBalanceGbp = clampNonNegativeGbp(subGbp(rentChargedGbp, rentReceivedGbp));
  const depositBalanceGbp = clampNonNegativeGbp(subGbp(depositRequiredGbp, depositReceivedGbp));
  // Signed rent/extra position (approved payments only). Deposit is shown but not included
  // in the pre-check-in collectable balance — unpaid deposit cannot be applied here.
  // Pending approval never reduces this figure.
  const signedChargePositionGbp = roundGbp(
    addGbp(subGbp(rentChargedGbp, rentReceivedGbp), subGbp(extrasPosted, extrasReceived)),
  );

  let positionDirection: HireEndHirePositionDirection = "settled";
  let positionAmountGbp = 0;
  let positionLabel = "Account is clear before check-in";
  if (signedChargePositionGbp > 0.005) {
    positionDirection = "driver_owes_company";
    positionAmountGbp = signedChargePositionGbp;
    positionLabel = `Driver owes ${formatGbp(positionAmountGbp)} before check-in`;
  } else if (signedChargePositionGbp < -0.005) {
    positionDirection = "company_owes_driver";
    positionAmountGbp = roundGbp(Math.abs(signedChargePositionGbp));
    positionLabel = `Company owes ${formatGbp(positionAmountGbp)} before check-in`;
  }

  const rentThroughLabel = `Rent through ${formatUkDateAtTime(input.returnDateYmd, input.returnTimeHm)}`;
  const rentLines: HireEndHireFinancialLine[] = [
    { id: "rent", label: rentThroughLabel, amountGbp: rentChargedGbp, signed: true },
    {
      id: "rent_paid",
      label: "Approved rent payments",
      amountGbp: rentReceivedGbp,
      signed: false,
    },
  ];
  pushPendingItems(rentLines, pendingApprovalItems, "rent");
  if (!pendingApprovalItems.length) {
    pushPendingLine(rentLines, "rent_pending", "Pending approval (rent)", pendingRentGbp);
  }

  const extraLines: HireEndHireFinancialLine[] = [
    {
      id: "extra_total",
      label: "Total extra charges",
      amountGbp: extrasPosted,
      signed: true,
    },
    {
      id: "extra_payments",
      label: "Approved extra-charge payments",
      amountGbp: extrasReceived,
      signed: false,
    },
  ];
  pushPendingItems(extraLines, pendingApprovalItems, "extra_charges");
  if (!pendingApprovalItems.length) {
    pushPendingLine(
      extraLines,
      "extra_pending",
      "Pending approval (extra charges)",
      pendingExtraChargesGbp,
    );
  }

  const depositLines: HireEndHireFinancialLine[] = [
    {
      id: "deposit_required",
      label: "Deposit required",
      amountGbp: depositRequiredGbp,
      signed: true,
    },
    {
      id: "deposit_received",
      label: "Deposit received",
      amountGbp: depositReceivedGbp,
      signed: false,
    },
  ];
  pushPendingItems(depositLines, pendingApprovalItems, "deposit");
  if (!pendingApprovalItems.length) {
    pushPendingLine(depositLines, "deposit_pending", "Pending approval (deposit)", pendingDepositGbp);
  }

  const accountSections: HireEndHireAccountSection[] = [
    { id: "rent", title: "Rent", lines: rentLines },
    { id: "extra_charges", title: "Extra charges", lines: extraLines },
    { id: "deposit", title: "Deposit", lines: depositLines },
  ];
  const lines = accountSections.flatMap((section) => section.lines);

  const rentChargedHint = input.rentDaysHint?.trim() || "Contract rent to return date";
  const rentReceivedHint =
    rentReceivedGbp > 0.005 ? "Approved rent payments" : "No approved rent payments";
  const extraChargesHint = categoryBalanceHint(
    extrasPosted,
    extrasReceived,
    extrasOutstanding,
    pendingExtraChargesGbp,
  );

  const categories: HireEndHireCategoryCard[] = [
    {
      id: "rent",
      title: "Rent",
      chargedGbp: roundGbp(rentChargedGbp),
      receivedGbp: roundGbp(rentReceivedGbp),
      pendingApprovalGbp: roundGbp(pendingRentGbp),
      balanceGbp: roundGbp(rentBalanceGbp),
      hint: categoryBalanceHint(rentChargedGbp, rentReceivedGbp, rentBalanceGbp, pendingRentGbp),
    },
    {
      id: "extra_charges",
      title: "Extra charges",
      chargedGbp: roundGbp(extrasPosted),
      receivedGbp: roundGbp(extrasReceived),
      pendingApprovalGbp: roundGbp(pendingExtraChargesGbp),
      balanceGbp: roundGbp(extrasOutstanding),
      hint: extraChargesHint,
    },
    {
      id: "deposit",
      title: "Deposit",
      chargedGbp: roundGbp(depositRequiredGbp),
      receivedGbp: roundGbp(depositReceivedGbp),
      pendingApprovalGbp: roundGbp(pendingDepositGbp),
      balanceGbp: roundGbp(depositBalanceGbp),
      hint:
        depositRequiredGbp <= 0.005 && pendingDepositGbp <= 0.005
          ? "No deposit on this hire"
          : categoryBalanceHint(
              depositRequiredGbp,
              depositReceivedGbp,
              depositBalanceGbp,
              pendingDepositGbp,
            ),
    },
  ];

  return {
    rentChargedGbp,
    rentChargedHint,
    rentReceivedGbp,
    rentReceivedHint,
    depositRequiredGbp,
    depositReceivedGbp,
    depositUnpaid: depositRequiredGbp > 0.005 && depositReceivedGbp <= 0.005,
    depositRequiredGbpLabel: "Contract amount only",
    extraChargesPostedGbp: roundGbp(extrasPosted),
    extraChargesReceivedGbp: roundGbp(extrasReceived),
    extraChargesOutstandingGbp: roundGbp(extrasOutstanding),
    extraChargesHint,
    pendingRentGbp: roundGbp(pendingRentGbp),
    pendingExtraChargesGbp: roundGbp(pendingExtraChargesGbp),
    pendingDepositGbp: roundGbp(pendingDepositGbp),
    pendingApprovalTotalGbp,
    pendingApprovalItems: [...pendingApprovalItems],
    owedBeforeCheckinGbp: positionAmountGbp,
    positionDirection,
    positionLabel,
    categories,
    accountSections,
    lines,
  };
}

export function formatHireEndHireSignedAmount(amountGbp: number, signed: boolean): string {
  const abs = formatGbp(Math.abs(amountGbp));
  if (amountGbp <= 0.005) return signed ? `+${formatGbp(0)}` : `−${formatGbp(0)}`;
  return signed ? `+${abs}` : `−${abs}`;
}
