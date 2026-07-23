import { cache } from "react";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { can, canReadRentals } from "@/lib/auth/rental-permissions";
import { driverHireStatusLabel } from "@/lib/fleet/driver-hire-nav";
import { formatRentLabel } from "@/lib/fleet/hire-access-display";
import type { HireGroupStatus } from "@/lib/fleet/hire-types";
import { createClient } from "@/lib/supabase/server";

export type HireWorkspaceShell = {
  hireGroupId: string;
  status: HireGroupStatus;
  statusLabel: string;
  vehicleId: string;
  vehicleVrm: string;
  vehicleLabel: string;
  driverLabel: string | null;
  startDate: string;
  rentLabel: string | null;
  canManagePayments: boolean;
  canApprovePayments: boolean;
};

export type HireWorkspaceShellResult =
  | ({ ok: true } & HireWorkspaceShell)
  | { ok: false; error: string };

async function fetchHireWorkspaceShell(groupId: string): Promise<HireWorkspaceShellResult> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const id = groupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, start_date, rent_cadence, rent_amount_gbp, vehicle_id, driver_email, driver_licence_number, vehicles(vrm, make, model)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Hire not found." };

  const vehicle = data.vehicles as { vrm?: string; make?: string; model?: string } | null;
  const driverLabel =
    (data.driver_email as string | null)?.trim() ||
    (data.driver_licence_number as string | null)?.trim() ||
    null;

  return {
    ok: true,
    hireGroupId: data.id as string,
    status: data.status as HireGroupStatus,
    statusLabel: driverHireStatusLabel(data.status as string),
    vehicleId: data.vehicle_id as string,
    vehicleVrm: vehicle?.vrm?.trim() || "—",
    vehicleLabel: [vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || "—",
    driverLabel,
    startDate: data.start_date as string,
    rentLabel: formatRentLabel(data.rent_amount_gbp, data.rent_cadence),
    canManagePayments: can(profile, "rentals.write"),
    canApprovePayments: can(profile, "billing.pay"),
  };
}

export const getHireWorkspaceShell = cache(fetchHireWorkspaceShell);

export type HireSwitcherOption = {
  id: string;
  vehicleVrm: string;
  driverLabel: string | null;
  status: string;
};

export async function loadHireSwitcherList(): Promise<
  { ok: true; hires: HireSwitcherOption[] } | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, status, driver_email, driver_licence_number, vehicles(vrm)")
    .not("status", "eq", "draft")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return { ok: false, error: error.message };

  const hires: HireSwitcherOption[] = (data ?? []).map((row) => ({
    id: row.id as string,
    vehicleVrm: (row.vehicles as { vrm?: string } | null)?.vrm?.trim() || "—",
    driverLabel:
      (row.driver_email as string | null)?.trim() ||
      (row.driver_licence_number as string | null)?.trim() ||
      null,
    status: row.status as string,
  }));

  return { ok: true, hires };
}
