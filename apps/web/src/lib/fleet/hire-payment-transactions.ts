/**
 * Hire payment transaction model — what each action must update.
 *
 * Keep server actions aligned with this spec. When adding a new money flow,
 * extend the union and implement every listed side effect.
 */

export const HIRE_PAYMENT_TRANSACTION_KINDS = [
  "schedule_payment_submit",
  "schedule_payment_approve",
  "schedule_payment_reject",
  "schedule_payment_amend",
  "schedule_discount",
  "contract_termination",
  "settlement_balance_payment",
  "deposit_disposition_resolve",
  "driver_charge_checkin",
] as const;

export type HirePaymentTransactionKind = (typeof HIRE_PAYMENT_TRANSACTION_KINDS)[number];

export type HirePaymentTransactionEffect = {
  table: string;
  fields: string[];
  notes?: string;
};

export type HirePaymentTransactionSpec = {
  kind: HirePaymentTransactionKind;
  label: string;
  when: string;
  effects: HirePaymentTransactionEffect[];
};

/** Authoritative map of DB writes per transaction type. */
export const HIRE_PAYMENT_TRANSACTION_SPECS: readonly HirePaymentTransactionSpec[] = [
  {
    kind: "schedule_payment_submit",
    label: "Driver submits rent payment",
    when: "Active hire — driver allocates cash across schedule rows",
    effects: [
      {
        table: "vehicle_hire_payment_status_events",
        fields: ["schedule_row_id", "event_kind", "to_status", "amendment_payload", "actor_*"],
        notes: "to_status = pending_approval",
      },
      {
        table: "vehicle_hire_payment_schedule",
        fields: ["payment_status"],
        notes: "pending_approval on affected rows",
      },
    ],
  },
  {
    kind: "schedule_payment_approve",
    label: "Staff approves rent payment",
    when: "Active hire — finance approves driver submission or staff records payment",
    effects: [
      {
        table: "vehicle_hire_payment_status_events",
        fields: ["schedule_row_id", "event_kind", "to_status", "amendment_payload", "actor_*"],
        notes: "to_status = approved",
      },
      {
        table: "vehicle_hire_payment_schedule",
        fields: ["payment_status", "approved_amount_gbp"],
      },
    ],
  },
  {
    kind: "schedule_payment_reject",
    label: "Staff rejects rent payment",
    when: "Active hire — finance rejects driver submission",
    effects: [
      {
        table: "vehicle_hire_payment_status_events",
        fields: ["schedule_row_id", "event_kind", "to_status", "comment", "actor_*"],
      },
      {
        table: "vehicle_hire_payment_schedule",
        fields: ["payment_status"],
        notes: "reverts to not_received",
      },
    ],
  },
  {
    kind: "schedule_payment_amend",
    label: "Staff amends approved payment",
    when: "Active hire — finance changes approved amount",
    effects: [
      {
        table: "vehicle_hire_payment_status_events",
        fields: ["schedule_row_id", "event_kind", "amendment_payload", "actor_*"],
      },
      {
        table: "vehicle_hire_payment_schedule",
        fields: ["approved_amount_gbp", "payment_status"],
        notes: "Amending to £0 clears approval (not_received, approved_amount null)",
      },
    ],
  },
  {
    kind: "schedule_discount",
    label: "Staff applies schedule discount",
    when: "Active hire — discount on a rent row",
    effects: [
      {
        table: "vehicle_hire_schedule_discounts",
        fields: ["schedule_row_id", "amount_gbp", "reason"],
      },
    ],
  },
  {
    kind: "contract_termination",
    label: "Contract ended",
    when: "Staff terminates an active hire",
    effects: [
      {
        table: "vehicle_hire_groups",
        fields: [
          "status",
          "terminated_at",
          "termination_reason",
          "deposit_disposition*",
          "termination_settlement",
          "settlement_resolution",
          "settlement_balance_*",
          "settlement_discount_gbp",
          "driver_documents_retain_until",
        ],
      },
      {
        table: "vehicle_hire_balance_payments",
        fields: ["amount_gbp", "direction", "payment_method", "notes"],
        notes: "When settlement resolution is paid_now",
      },
      {
        table: "vehicle_hire_payment_schedule",
        fields: ["payment_status", "approved_amount_gbp"],
        notes: "Deposit credit applied to accrued rent rows when deposit offsets rent",
      },
      {
        table: "vehicle_hire_payment_status_events",
        fields: ["schedule_row_id", "event_kind", "amendment_payload"],
        notes: "Audit trail for deposit-applied rent credit",
      },
      {
        table: "vehicle_hire_agreements",
        fields: ["status"],
        notes: "terminated",
      },
    ],
  },
  {
    kind: "settlement_balance_payment",
    label: "Settlement ledger payment",
    when: "Ended hire — staff records phased settlement (rent/deposit net)",
    effects: [
      {
        table: "vehicle_hire_balance_payments",
        fields: [
          "amount_gbp",
          "direction",
          "payment_category",
          "payment_method",
          "payment_account_id",
          "payment_reference",
          "notes",
        ],
        notes: "payment_category = settlement",
      },
      {
        table: "vehicle_hire_groups",
        fields: ["settlement_balance_gbp", "settlement_balance_direction"],
        notes: "Recomputed remaining open balance",
      },
    ],
  },
  {
    kind: "deposit_disposition_resolve",
    label: "Deposit disposition resolved",
    when: "Ended hire — staff resolves hold_pending deposit",
    effects: [
      {
        table: "vehicle_hire_groups",
        fields: [
          "deposit_disposition*",
          "termination_settlement",
          "settlement_resolution",
          "settlement_balance_*",
          "settlement_discount_gbp",
        ],
      },
      {
        table: "vehicle_hire_balance_payments",
        fields: ["amount_gbp", "direction", "payment_method", "notes"],
        notes: "When net settlement requires paid_now",
      },
      {
        table: "vehicle_hire_payment_schedule",
        fields: ["payment_status", "approved_amount_gbp"],
        notes: "Deposit credit applied to accrued rent rows (same as termination)",
      },
      {
        table: "vehicle_hire_payment_status_events",
        fields: ["schedule_row_id", "event_kind", "amendment_payload"],
        notes: "Audit trail for deposit-applied rent credit",
      },
    ],
  },
  {
    kind: "driver_charge_checkin",
    label: "Check-in driver charge",
    when: "Vehicle returned — damage charge at check-in",
    effects: [
      {
        table: "vehicle_hire_driver_charge_line_items",
        fields: ["charge_type", "amount_gbp", "resolution", "source_*", "balance_payment_id"],
      },
      {
        table: "vehicle_hire_balance_payments",
        fields: ["amount_gbp", "direction", "payment_category"],
        notes: "paid_now only — payment_category = driver_charge",
      },
      {
        table: "vehicle_hire_groups",
        fields: ["settlement_balance_*"],
        notes: "add_to_balance increases open settlement; paid_now may reduce it",
      },
    ],
  },
];

export function hirePaymentTransactionSpec(
  kind: HirePaymentTransactionKind,
): HirePaymentTransactionSpec | undefined {
  return HIRE_PAYMENT_TRANSACTION_SPECS.find((spec) => spec.kind === kind);
}
