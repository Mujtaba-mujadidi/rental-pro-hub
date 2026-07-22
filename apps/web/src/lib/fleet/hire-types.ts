export const HIRE_GROUP_STATUSES = [
  "draft",
  "pending_signature",
  "reserved",
  "active",
  "completed",
  "terminated",
  "cancelled",
] as const;

export type HireGroupStatus = (typeof HIRE_GROUP_STATUSES)[number];

export const CONTRACT_LENGTH_KINDS = ["annual", "six_months", "custom"] as const;

export type ContractLengthKind = (typeof CONTRACT_LENGTH_KINDS)[number];

export const RENT_CADENCES = ["daily", "weekly", "monthly"] as const;

export type RentCadence = (typeof RENT_CADENCES)[number];

export const HIRE_PAYMENT_STATUSES = [
  "not_received",
  "pending_approval",
  "rejected",
  "approved",
] as const;

export type HirePaymentStatus = (typeof HIRE_PAYMENT_STATUSES)[number];

export const ACTIVE_HIRE_GROUP_STATUSES: readonly HireGroupStatus[] = [
  "pending_signature",
  "reserved",
  "active",
];

/** Hire group statuses that block the vehicle from another hire (includes in-progress drafts). */
export const HIRE_VEHICLE_BLOCKING_STATUSES: readonly HireGroupStatus[] = [
  "draft",
  "pending_signature",
  "reserved",
  "active",
];
