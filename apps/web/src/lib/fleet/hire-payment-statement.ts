import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";
import {
  buildHireEndedDepositRefundDisplay,
  buildHireEndedPositionSnapshot,
  buildHireEndedRentCalculation,
} from "@/lib/fleet/hire-ended-payments-display";
import { buildHireEndedOutstandingBalance } from "@/lib/fleet/hire-ended-summary-display";
import {
  hireLedgerPaymentTypeLabel,
  summarizeHireSettlementLedger,
} from "@/lib/fleet/hire-payments-ledger";
import { formatGbp } from "@/lib/fleet/maintenance";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export type HirePaymentStatementSection = {
  heading: string;
  lines: string[];
};

export type HirePaymentStatementContent = {
  fileName: string;
  sections: HirePaymentStatementSection[];
};

function sanitizeFileToken(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hire";
}

export function hirePaymentStatementFileName(input: {
  vehicleVrm: string;
  contractEndedYmd: string | null;
}): string {
  const vrm = sanitizeFileToken(input.vehicleVrm);
  const end = input.contractEndedYmd ? sanitizeFileToken(input.contractEndedYmd) : "statement";
  return `hire-payment-statement-${vrm}-${end}.pdf`;
}

/** Build printable statement sections from authorised payments page data. */
export function buildHirePaymentStatementContent(
  data: HirePaymentsPageData,
  options?: { audience?: "staff" | "driver" },
): HirePaymentStatementContent {
  const audience = options?.audience ?? "staff";
  const ledger = summarizeHireSettlementLedger(data.settlementBalancePayments);
  const outstanding = buildHireEndedOutstandingBalance(data, {
    refundPaidGbp: ledger.settlementPaidGbp,
    audience,
  });
  const rentCalc = buildHireEndedRentCalculation(data);
  const depositRefund = buildHireEndedDepositRefundDisplay({ payments: data, audience });
  const position = buildHireEndedPositionSnapshot(data);

  const sections: HirePaymentStatementSection[] = [
    {
      heading: "Outstanding balance",
      lines: [
        `Status: ${outstanding.statusLabel}`,
        `Amount: ${formatGbp(outstanding.amountGbp)}`,
        outstanding.headline,
        ...(outstanding.detail ? [outstanding.detail] : []),
      ],
    },
    {
      heading: "Rent calculation",
      lines: [
        `Rent due to end date: ${formatGbp(rentCalc.rentDueToEndGbp)}`,
        audience === "driver"
          ? `You paid during hire: ${formatGbp(rentCalc.paymentReceivedDuringHireGbp)}`
          : `Payment received during hire: ${formatGbp(rentCalc.paymentReceivedDuringHireGbp)}`,
        `Paid from deposit: ${formatGbp(rentCalc.paidFromDepositGbp)}`,
        `Rent outstanding: ${formatGbp(rentCalc.rentOutstandingGbp)}`,
        ...(rentCalc.cancelledPeriodNote ? [rentCalc.cancelledPeriodNote] : []),
      ],
    },
  ];

  if (depositRefund) {
    sections.push({
      heading: "Deposit and refund",
      lines: [
        `Original deposit: ${formatGbp(depositRefund.originalDepositGbp)}`,
        `Less unpaid rent: ${formatGbp(depositRefund.lessUnpaidRentGbp)}`,
        `Less damage charge: ${formatGbp(depositRefund.lessDamageGbp)}`,
        `${depositRefund.refundPaidLabel}: ${formatGbp(depositRefund.refundPaidToDriverGbp)}`,
        ...(depositRefund.refundNote ? [depositRefund.refundNote] : []),
      ],
    });
  }

  const charges = data.driverChargeLineItems.filter(
    (item) =>
      (item.resolution === "add_to_balance" || item.resolution === "paid_now") &&
      item.amountGbp > 0.005,
  );
  if (charges.length) {
    sections.push({
      heading: audience === "driver" ? "Charges on your account" : "Charges",
      lines: charges.map((item) => {
        const when = item.createdAt ? ` (${formatUkDateTime(item.createdAt)})` : "";
        return `${item.chargeTypeLabel}: ${item.description?.trim() || "Charge"} — ${formatGbp(item.amountGbp)}${when}`;
      }),
    });
  }

  if (data.settlementBalancePayments.length) {
    sections.push({
      heading: "Settlement transactions",
      lines: data.settlementBalancePayments.map((payment) => {
        const label = hireLedgerPaymentTypeLabel({
          direction: payment.direction,
          paymentCategory: payment.paymentCategory,
          notes: payment.notes,
          audience,
        });
        const method = PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod;
        return `${formatUkDateTime(payment.paidAt)} — ${label} — ${method} — ${formatGbp(payment.amountGbp)}`;
      }),
    });
  }

  if (position) {
    sections.push({
      heading:
        audience === "driver"
          ? "Position when your hire ended"
          : "Position when the contract ended",
      lines: [
        `Rent due: ${formatGbp(position.rentDueGbp)}`,
        audience === "driver"
          ? `Rent paid by you: ${formatGbp(position.rentPaidByDriverGbp)}`
          : `Rent paid by driver: ${formatGbp(position.rentPaidByDriverGbp)}`,
        `Deposit applied to rent: ${formatGbp(position.depositAppliedToRentGbp)}`,
        `Refund due before later charges: ${formatGbp(position.refundDueBeforeLaterChargesGbp)}`,
      ],
    });
  }

  if (data.rows.length) {
    sections.push({
      heading: "Full rent schedule",
      lines: data.rows.map((row) => {
        const period =
          row.rowKind === "deposit"
            ? "Deposit"
            : row.periodStart === row.periodEnd
              ? formatUkDate(row.periodStart)
              : `${formatUkDate(row.periodStart)} – ${formatUkDate(row.periodEnd)}`;
        return `${period} — due ${formatGbp(row.netDueGbp)} — paid ${formatGbp(row.paidGbp)} — balance ${formatGbp(row.balanceGbp)}`;
      }),
    });
  }

  return {
    fileName: hirePaymentStatementFileName({
      vehicleVrm: data.vehicleVrm,
      contractEndedYmd: data.contractEndedYmd,
    }),
    sections,
  };
}
