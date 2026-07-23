"use server";

import { getSessionUser } from "@/lib/auth/profile";
import { formatUkDate } from "@/lib/datetime/uk";
import {
  formatRentLabel,
  parseHireAccessSnapshot,
  type HireAccessDisplay,
} from "@/lib/fleet/hire-access-display";
import { HIRE_ACCESS_VEHICLE_SELECT } from "@/lib/fleet/hire-access-vehicle-fields";
import {
  DRIVER_CURRENT_HIRE_STATUSES,
  DRIVER_HIRE_HISTORY_STATUSES,
  driverHireStatusLabel,
} from "@/lib/fleet/driver-hire-nav";
import { createClient } from "@/lib/supabase/server";

const MY_HIRE_SHELL_SELECT =
  `id, status, start_date, rent_cadence, rent_amount_gbp, activated_at, ended_at, vehicles(${HIRE_ACCESS_VEHICLE_SELECT}), companies(name)`;

const MY_HIRE_RENTAL_SELECT =
  `id, status, start_date, rent_cadence, rent_amount_gbp, deposit_gbp, include_deposit, draft_snapshot, activated_at, ended_at, companies(name), vehicles(${HIRE_ACCESS_VEHICLE_SELECT}), subcompanies(legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode), company_hire_terms_versions(title, body, version_label), vehicle_hire_agreements(contract_length_kind, end_date, status, signed_at)`;

export type DriverMyHireShellRow = {
  hireGroupId: string;
  status: string;
  statusLabel: string;
  companyName: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  startDateLabel: string;
  rentLabel: string | null;
  activatedAtLabel: string | null;
};

export type DriverMyHireRentalDetails = HireAccessDisplay & {
  hireGroupId: string;
  status: string;
  statusLabel: string;
  agreementLines: string[];
};

export type DriverMyHirePaymentRow = {
  id: string;
  periodStartLabel: string;
  periodEndLabel: string;
  amountLabel: string;
  rowKind: string;
  paymentStatus: string;
  paymentStatusLabel: string;
};

export type DriverHireHistoryRow = {
  hireGroupId: string;
  status: string;
  statusLabel: string;
  companyName: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  startDateLabel: string;
  endDateLabel: string | null;
  signedAgreementCount: number;
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_received: "Not received",
  pending_approval: "Pending approval",
  rejected: "Rejected",
  approved: "Approved",
};

async function requireDriverUserId(): Promise<{ userId: string } | { error: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in required." };
  return { userId: user.id };
}

async function assertDriverOwnsHireGroup(
  hireGroupId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id")
    .eq("id", hireGroupId)
    .eq("driver_user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "Hire not found." };
  return { ok: true };
}

function mapShellRow(row: Record<string, unknown>): DriverMyHireShellRow {
  const vehicle = (row.vehicles ?? null) as { vrm?: string; make?: string; model?: string } | null;
  const company = (row.companies ?? null) as { name?: string } | null;
  const status = String(row.status ?? "");
  const startDate = typeof row.start_date === "string" ? row.start_date : null;
  const activatedAt = typeof row.activated_at === "string" ? row.activated_at : null;

  return {
    hireGroupId: row.id as string,
    status,
    statusLabel: driverHireStatusLabel(status),
    companyName: company?.name?.trim() || "Rental company",
    vehicleVrm: vehicle?.vrm?.trim() || "—",
    vehicleMakeModel: [vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || "—",
    startDateLabel: startDate ? formatUkDate(startDate) : "—",
    rentLabel: formatRentLabel(row.rent_amount_gbp, row.rent_cadence),
    activatedAtLabel: activatedAt ? formatUkDate(activatedAt.slice(0, 10)) : null,
  };
}

function mapAgreementLines(
  agreements: { contract_length_kind?: string; end_date?: string | null; signed_at?: string | null }[] | null,
): string[] {
  if (!agreements?.length) return [];
  return agreements
    .map((agreement) => {
      const kind = agreement.contract_length_kind?.replace(/_/g, " ") ?? "Contract";
      const end = agreement.end_date ? formatUkDate(agreement.end_date) : null;
      const signed = agreement.signed_at ? "signed" : "unsigned";
      return end ? `${kind} (ends ${end}, ${signed})` : `${kind} (${signed})`;
    })
    .filter(Boolean);
}

/** Lightweight summary for the driver My hire page shell. */
export async function loadDriverMyHireShellAction(): Promise<
  { ok: true; rows: DriverMyHireShellRow[] } | { ok: false; error: string }
> {
  const auth = await requireDriverUserId();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select(MY_HIRE_SHELL_SELECT)
    .eq("driver_user_id", auth.userId)
    .in("status", [...DRIVER_CURRENT_HIRE_STATUSES])
    .order("start_date", { ascending: false });
  if (error) return { ok: false, error: error.message };

  return { ok: true, rows: (data ?? []).map((row) => mapShellRow(row as Record<string, unknown>)) };
}

/** Full rental details — fetched only when the driver expands that section. */
export async function loadDriverMyHireRentalDetailsAction(
  hireGroupId: string,
): Promise<{ ok: true; details: DriverMyHireRentalDetails } | { ok: false; error: string }> {
  const auth = await requireDriverUserId();
  if ("error" in auth) return { ok: false, error: auth.error };

  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const owned = await assertDriverOwnsHireGroup(id, auth.userId);
  if (!owned.ok) return { ok: false, error: owned.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select(MY_HIRE_RENTAL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Hire not found." };

  const row = data as Record<string, unknown>;
  const status = String(row.status ?? "");
  const display = parseHireAccessSnapshot(row, "Rental company", null);
  const agreements = (row.vehicle_hire_agreements ?? null) as
    | { contract_length_kind?: string; end_date?: string | null; signed_at?: string | null }[]
    | null;

  return {
    ok: true,
    details: {
      ...display,
      hireGroupId: id,
      status,
      statusLabel: driverHireStatusLabel(status),
      agreementLines: mapAgreementLines(agreements),
    },
  };
}

/** Payment schedule rows — fetched only when the driver expands that section. */
export async function loadDriverMyHirePaymentScheduleAction(
  hireGroupId: string,
): Promise<{ ok: true; rows: DriverMyHirePaymentRow[] } | { ok: false; error: string }> {
  const auth = await requireDriverUserId();
  if ("error" in auth) return { ok: false, error: auth.error };

  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const owned = await assertDriverOwnsHireGroup(id, auth.userId);
  if (!owned.ok) return { ok: false, error: owned.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select("id, period_start, period_end, base_amount_gbp, row_kind, payment_status")
    .eq("hire_group_id", id)
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const rows: DriverMyHirePaymentRow[] = (data ?? []).map((row) => {
    const paymentStatus = String(row.payment_status ?? "not_received");
    const amount = Number(row.base_amount_gbp);
    return {
      id: row.id as string,
      periodStartLabel: formatUkDate(row.period_start as string),
      periodEndLabel: formatUkDate(row.period_end as string),
      amountLabel: Number.isFinite(amount) ? `£${amount.toFixed(2)}` : "—",
      rowKind: String(row.row_kind ?? "rent"),
      paymentStatus,
      paymentStatusLabel: PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus.replace(/_/g, " "),
    };
  });

  return { ok: true, rows };
}

/** Compact list for driver hire history. */
export async function loadDriverHireHistoryAction(): Promise<
  { ok: true; rows: DriverHireHistoryRow[] } | { ok: false; error: string }
> {
  const auth = await requireDriverUserId();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      `id, status, start_date, ended_at, terminated_at, vehicles(vrm, make, model), companies(name), vehicle_hire_agreements(signed_at)`,
    )
    .eq("driver_user_id", auth.userId)
    .in("status", [...DRIVER_HIRE_HISTORY_STATUSES])
    .order("ended_at", { ascending: false, nullsFirst: false })
    .order("start_date", { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };

  const rows: DriverHireHistoryRow[] = (data ?? []).map((row) => {
    const vehicle = (row.vehicles ?? null) as { vrm?: string; make?: string; model?: string } | null;
    const company = (row.companies ?? null) as { name?: string } | null;
    const status = String(row.status ?? "");
    const startDate = typeof row.start_date === "string" ? row.start_date : null;
    const endedAt =
      (typeof row.ended_at === "string" && row.ended_at) ||
      (typeof row.terminated_at === "string" && row.terminated_at) ||
      null;
    const agreements = (row.vehicle_hire_agreements ?? null) as { signed_at?: string | null }[] | null;
    const signedAgreementCount = agreements?.filter((a) => a.signed_at).length ?? 0;

    return {
      hireGroupId: row.id as string,
      status,
      statusLabel: driverHireStatusLabel(status),
      companyName: company?.name?.trim() || "Rental company",
      vehicleVrm: vehicle?.vrm?.trim() || "—",
      vehicleMakeModel: [vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || "—",
      startDateLabel: startDate ? formatUkDate(startDate) : "—",
      endDateLabel: endedAt ? formatUkDate(endedAt.slice(0, 10)) : null,
      signedAgreementCount,
    };
  });

  return { ok: true, rows };
}
