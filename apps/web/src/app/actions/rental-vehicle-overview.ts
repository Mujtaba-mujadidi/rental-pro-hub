"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import { getVehicleWorkspaceShell } from "@/lib/fleet/load-vehicle-workspace-shell";
import { rentAmountToDailyGbp } from "@/lib/fleet/company-dashboard-display";
import {
  ACTIVE_HIRE_GROUP_STATUSES,
  type HireGroupStatus,
  type RentCadence,
} from "@/lib/fleet/hire-types";
import { loadDriverLabelsMap } from "@/lib/fleet/driver-labels";
import { ukLondonDayYmd } from "@/lib/datetime/uk";

export type VehicleOverviewCurrentHire = {
  hireGroupId: string;
  status: HireGroupStatus;
  driverLabel: string;
  startDate: string;
  endDate: string | null;
  rentAmountGbp: number;
  rentCadence: RentCadence;
  agreementLabel: string;
  /** Rough current-month hire income from active rent cadence. */
  monthlyIncomeGbp: number;
};

export type VehicleOverviewSummary = {
  currentHire: VehicleOverviewCurrentHire | null;
};

function daysInCurrentUkMonth(): number {
  const today = ukLondonDayYmd(new Date()) ?? new Date().toISOString().slice(0, 10);
  const [y, m] = today.split("-").map(Number);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function estimateMonthlyIncomeGbp(amountGbp: number, cadence: RentCadence): number {
  const daily = rentAmountToDailyGbp(amountGbp, cadence);
  return Math.round(daily * daysInCurrentUkMonth() * 100) / 100;
}

function agreementLabelFor(
  agreements: { signed_at: string | null }[],
): string {
  if (!agreements.length) return "—";
  const signed = agreements.filter((a) => Boolean(a.signed_at)).length;
  if (signed === agreements.length) return "Fully signed";
  if (signed === 0) return "Awaiting signature";
  return `${signed}/${agreements.length} signed`;
}

/**
 * Lightweight overview extras for the vehicle workspace (current hire snapshot).
 * Authorisation: vehicle workspace shell + rentals.read for hire PII labels.
 */
export async function loadVehicleOverviewSummaryAction(
  vehicleId: string,
): Promise<{ ok: true; data: VehicleOverviewSummary } | { ok: false; error: string }> {
  const shell = await getVehicleWorkspaceShell(vehicleId);
  if (!shell.ok) return { ok: false, error: shell.error };

  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) {
    return { ok: true, data: { currentHire: null } };
  }

  const openStatuses = ["draft", ...ACTIVE_HIRE_GROUP_STATUSES] as const;
  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, start_date, rent_cadence, rent_amount_gbp, driver_user_id, vehicle_hire_agreements(id, end_date, signed_at)",
    )
    .eq("vehicle_id", vehicleId)
    .in("status", [...openStatuses])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!group) return { ok: true, data: { currentHire: null } };

  const agreements = (
    (group as {
      vehicle_hire_agreements?: { id: string; end_date: string | null; signed_at: string | null }[];
    }).vehicle_hire_agreements ?? []
  );

  let driverLabel = "Driver";
  const driverUserId = (group.driver_user_id as string | null)?.trim();
  if (driverUserId) {
    try {
      const labels = await loadDriverLabelsMap(createSupabaseAdminClient(), [driverUserId]);
      driverLabel = labels.get(driverUserId) ?? "Driver";
    } catch {
      /* optional */
    }
  }

  const endDates = agreements.map((a) => a.end_date).filter(Boolean) as string[];
  endDates.sort();
  const endDate = endDates.at(-1) ?? null;

  const rentCadence = (group.rent_cadence as RentCadence) ?? "weekly";
  const rentAmountGbp = Number(group.rent_amount_gbp) || 0;

  return {
    ok: true,
    data: {
      currentHire: {
        hireGroupId: group.id as string,
        status: group.status as HireGroupStatus,
        driverLabel,
        startDate: group.start_date as string,
        endDate,
        rentAmountGbp,
        rentCadence,
        agreementLabel: agreementLabelFor(agreements),
        monthlyIncomeGbp: estimateMonthlyIncomeGbp(rentAmountGbp, rentCadence),
      },
    },
  };
}
