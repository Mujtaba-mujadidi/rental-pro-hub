"use server";

import { getSessionUser } from "@/lib/auth/profile";
import { formatUkDate, formatUkDateTimeSeconds } from "@/lib/datetime/uk";
import { formatHireContractEndLabel } from "@/lib/fleet/hire-pdf-details";
import {
  formatRentLabel,
  parseHireAccessSnapshot,
} from "@/lib/fleet/hire-access-display";
import {
  formatDriverHireContractStartLabel,
  resolveDriverHireCompanyName,
  resolveDriverHireVehicleDisplay,
  type DriverHireDisplayLookups,
} from "@/lib/fleet/driver-hire-display";
import {
  DRIVER_CURRENT_HIRE_STATUSES,
  DRIVER_HIRE_HISTORY_STATUSES,
  DRIVER_HIRE_WORKSPACE_STATUSES,
  driverHireStatusLabel,
} from "@/lib/fleet/driver-hire-nav";
import type {
  DriverHireHistoryRow,
  DriverHireWorkspaceShell,
  DriverMyHirePaymentRow,
  DriverMyHireRentalDetails,
  DriverMyHireShellRow,
} from "@/lib/fleet/driver-hire-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MY_HIRE_SHELL_SELECT =
  "id, status, start_date, start_time, rent_cadence, rent_amount_gbp, activated_at, ended_at, terminated_at, vehicle_id, parent_company_id, subcompany_id";

const MY_HIRE_RENTAL_SELECT =
  `id, status, start_date, start_time, end_time, rent_cadence, rent_amount_gbp, deposit_gbp, include_deposit, draft_snapshot, activated_at, ended_at, vehicle_id, parent_company_id, subcompany_id, company_hire_terms_versions(title, body, version_label), vehicle_hire_agreements(contract_length_kind, end_date, status, signed_at)`;

const HIRE_HISTORY_SELECT =
  "id, status, start_date, start_time, activated_at, ended_at, terminated_at, vehicle_id, parent_company_id, subcompany_id, vehicle_hire_agreements(signed_at)";

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

async function requireDriverAdminClient():
  Promise<{ admin: ReturnType<typeof createSupabaseAdminClient> } | { error: string }> {
  try {
    return { admin: createSupabaseAdminClient() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Server error." };
  }
}

type DriverHireLookupRow = {
  vehicle_id: string | null;
  parent_company_id: string;
  subcompany_id: string | null;
};

async function loadDriverHireDisplayLookups(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  rows: DriverHireLookupRow[],
): Promise<DriverHireDisplayLookups> {
  const vehicleIds = [
    ...new Set(rows.map((row) => row.vehicle_id).filter((id): id is string => Boolean(id))),
  ];
  const subcompanyIds = [
    ...new Set(rows.map((row) => row.subcompany_id).filter((id): id is string => Boolean(id))),
  ];
  const companyIds = [...new Set(rows.map((row) => row.parent_company_id).filter(Boolean))];

  const [vehiclesRes, subcompaniesRes, companiesRes] = await Promise.all([
    vehicleIds.length
      ? admin.from("vehicles").select("id, vrm, make, model").in("id", vehicleIds)
      : Promise.resolve({ data: [] as { id: string; vrm?: string; make?: string; model?: string }[] }),
    subcompanyIds.length
      ? admin
          .from("subcompanies")
          .select("id, legal_name, display_name, name")
          .in("id", subcompanyIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            legal_name?: string;
            display_name?: string | null;
            name?: string;
          }[],
        }),
    companyIds.length
      ? admin.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] as { id: string; name?: string }[] }),
  ]);

  const vehiclesById = new Map(
    (vehiclesRes.data ?? []).map((vehicle) => [
      vehicle.id,
      { vrm: vehicle.vrm, make: vehicle.make, model: vehicle.model },
    ]),
  );
  const subcompaniesById = new Map(
    (subcompaniesRes.data ?? []).map((subcompany) => [
      subcompany.id,
      {
        legalName: subcompany.legal_name,
        displayName: subcompany.display_name,
        name: subcompany.name,
      },
    ]),
  );
  const companiesById = new Map(
    (companiesRes.data ?? []).map((company) => [company.id, { name: company.name }]),
  );

  return { vehiclesById, subcompaniesById, companiesById };
}

function mapShellRow(
  row: Record<string, unknown>,
  lookups: DriverHireDisplayLookups,
): DriverMyHireShellRow {
  const status = String(row.status ?? "");
  const startDate = typeof row.start_date === "string" ? row.start_date : null;
  const vehicleId = (row.vehicle_id as string | null) ?? null;
  const parentCompanyId = String(row.parent_company_id ?? "");
  const subcompanyId = (row.subcompany_id as string | null) ?? null;
  const vehicle = resolveDriverHireVehicleDisplay(vehicleId, lookups);

  return {
    hireGroupId: row.id as string,
    status,
    statusLabel: driverHireStatusLabel(status),
    companyName: resolveDriverHireCompanyName({
      parentCompanyId,
      subcompanyId,
      lookups,
    }),
    vehicleVrm: vehicle.vehicleVrm,
    vehicleMakeModel: vehicle.vehicleMakeModel,
    startDateLabel: formatDriverHireContractStartLabel(
      startDate,
      typeof row.start_time === "string" ? row.start_time : null,
    ),
    rentLabel: formatRentLabel(row.rent_amount_gbp, row.rent_cadence),
    activatedAtLabel:
      typeof row.activated_at === "string" && row.activated_at
        ? formatUkDateTimeSeconds(row.activated_at)
        : null,
  };
}

function mapAgreementLines(
  agreements: { contract_length_kind?: string; end_date?: string | null; signed_at?: string | null }[] | null,
  endTime?: string | null,
): string[] {
  if (!agreements?.length) return [];
  return agreements
    .map((agreement) => {
      const kind = agreement.contract_length_kind?.replace(/_/g, " ") ?? "Contract";
      const end = agreement.end_date ? formatHireContractEndLabel(agreement.end_date, endTime) : null;
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

  const adminRes = await requireDriverAdminClient();
  if ("error" in adminRes) return { ok: false, error: adminRes.error };

  const lookupRows = (data ?? []).map((row) => ({
    vehicle_id: (row.vehicle_id as string | null) ?? null,
    parent_company_id: String(row.parent_company_id ?? ""),
    subcompany_id: (row.subcompany_id as string | null) ?? null,
  }));
  const lookups = await loadDriverHireDisplayLookups(adminRes.admin, lookupRows);

  return {
    ok: true,
    rows: (data ?? []).map((row) => mapShellRow(row as Record<string, unknown>, lookups)),
  };
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

  const adminRes = await requireDriverAdminClient();
  if ("error" in adminRes) return { ok: false, error: adminRes.error };

  const row = data as Record<string, unknown>;
  const status = String(row.status ?? "");
  const display = parseHireAccessSnapshot(row, "Rental company", null);
  const lookups = await loadDriverHireDisplayLookups(adminRes.admin, [
    {
      vehicle_id: (row.vehicle_id as string | null) ?? null,
      parent_company_id: String(row.parent_company_id ?? ""),
      subcompany_id: (row.subcompany_id as string | null) ?? null,
    },
  ]);
  const vehicle = resolveDriverHireVehicleDisplay((row.vehicle_id as string | null) ?? null, lookups);
  const companyName = resolveDriverHireCompanyName({
    parentCompanyId: String(row.parent_company_id ?? ""),
    subcompanyId: (row.subcompany_id as string | null) ?? null,
    lookups,
  });
  const agreements = (row.vehicle_hire_agreements ?? null) as
    | { contract_length_kind?: string; end_date?: string | null; signed_at?: string | null }[]
    | null;

  return {
    ok: true,
    details: {
      ...display,
      companyName,
      vehicleVrm: vehicle.vehicleVrm,
      vehicleMakeModel: vehicle.vehicleMakeModel,
      hireGroupId: id,
      status,
      statusLabel: driverHireStatusLabel(status),
      agreementLines: mapAgreementLines(agreements, (row.end_time as string | null) ?? null),
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
    .select(HIRE_HISTORY_SELECT)
    .eq("driver_user_id", auth.userId)
    .in("status", [...DRIVER_HIRE_HISTORY_STATUSES])
    .order("ended_at", { ascending: false, nullsFirst: false })
    .order("start_date", { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };

  const adminRes = await requireDriverAdminClient();
  if ("error" in adminRes) return { ok: false, error: adminRes.error };

  const lookupRows = (data ?? []).map((row) => ({
    vehicle_id: (row.vehicle_id as string | null) ?? null,
    parent_company_id: String(row.parent_company_id ?? ""),
    subcompany_id: (row.subcompany_id as string | null) ?? null,
  }));
  const lookups = await loadDriverHireDisplayLookups(adminRes.admin, lookupRows);

  const rows: DriverHireHistoryRow[] = (data ?? []).map((row) => {
    const status = String(row.status ?? "");
    const startDate = typeof row.start_date === "string" ? row.start_date : null;
    const endedAt =
      (typeof row.ended_at === "string" && row.ended_at) ||
      (typeof row.terminated_at === "string" && row.terminated_at) ||
      null;
    const agreements = (row.vehicle_hire_agreements ?? null) as { signed_at?: string | null }[] | null;
    const signedAgreementCount = agreements?.filter((a) => a.signed_at).length ?? 0;
    const vehicleId = (row.vehicle_id as string | null) ?? null;
    const parentCompanyId = String(row.parent_company_id ?? "");
    const subcompanyId = (row.subcompany_id as string | null) ?? null;
    const vehicle = resolveDriverHireVehicleDisplay(vehicleId, lookups);

    return {
      hireGroupId: row.id as string,
      status,
      statusLabel: driverHireStatusLabel(status),
      companyName: resolveDriverHireCompanyName({
        parentCompanyId,
        subcompanyId,
        lookups,
      }),
      vehicleVrm: vehicle.vehicleVrm,
      vehicleMakeModel: vehicle.vehicleMakeModel,
      startDateLabel: formatDriverHireContractStartLabel(
      startDate,
      typeof row.start_time === "string" ? row.start_time : null,
    ),
      endDateLabel: endedAt ? formatUkDate(endedAt.slice(0, 10)) : null,
      terminatedAtLabel:
        typeof row.terminated_at === "string" && row.terminated_at
          ? formatUkDateTimeSeconds(row.terminated_at)
          : endedAt
            ? formatUkDateTimeSeconds(endedAt)
            : null,
      signedAgreementCount,
    };
  });

  return { ok: true, rows };
}

/** Shell for a single driver hire workspace (current or past). */
export async function loadDriverHireWorkspaceShellAction(
  hireGroupId: string,
): Promise<{ ok: true; shell: DriverHireWorkspaceShell } | { ok: false; error: string }> {
  const auth = await requireDriverUserId();
  if ("error" in auth) return { ok: false, error: auth.error };

  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const owned = await assertDriverOwnsHireGroup(id, auth.userId);
  if (!owned.ok) return { ok: false, error: owned.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select(MY_HIRE_SHELL_SELECT)
    .eq("id", id)
    .in("status", [...DRIVER_HIRE_WORKSPACE_STATUSES])
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Hire not found." };

  const adminRes = await requireDriverAdminClient();
  if ("error" in adminRes) return { ok: false, error: adminRes.error };

  const lookups = await loadDriverHireDisplayLookups(adminRes.admin, [
    {
      vehicle_id: (data.vehicle_id as string | null) ?? null,
      parent_company_id: String(data.parent_company_id ?? ""),
      subcompany_id: (data.subcompany_id as string | null) ?? null,
    },
  ]);
  const row = mapShellRow(data as Record<string, unknown>, lookups);
  const terminatedAt =
    typeof (data as { terminated_at?: string | null }).terminated_at === "string"
      ? (data as { terminated_at: string }).terminated_at
      : typeof (data as { ended_at?: string | null }).ended_at === "string"
        ? (data as { ended_at: string }).ended_at
        : null;

  return {
    ok: true,
    shell: {
      hireGroupId: row.hireGroupId,
      status: row.status,
      statusLabel: row.statusLabel,
      companyName: row.companyName,
      vehicleVrm: row.vehicleVrm,
      vehicleMakeModel: row.vehicleMakeModel,
      startDateLabel: row.startDateLabel,
      rentLabel: row.rentLabel,
      terminatedAtLabel: terminatedAt ? formatUkDateTimeSeconds(terminatedAt) : null,
    },
  };
}
