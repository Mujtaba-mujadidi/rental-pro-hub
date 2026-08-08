import { cache } from "react";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { can, canReadRentals } from "@/lib/auth/rental-permissions";
import { driverHireStatusLabel } from "@/lib/fleet/driver-hire-nav";
import { formatRentLabel } from "@/lib/fleet/hire-access-display";
import {
  getCachedHireSwitcherList,
  getCachedHireWorkspaceShellData,
  type HireSwitcherOption,
} from "@/lib/fleet/hire-workspace-cache";
import type { HireGroupStatus } from "@/lib/fleet/hire-types";

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

  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const id = groupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const data = await getCachedHireWorkspaceShellData(id, companyId);
  if (!data) return { ok: false, error: "Hire not found." };

  const driverLabel = data.driverEmail || data.driverLicenceNumber || null;
  const vehicleLabel = [data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ").trim() || "—";

  return {
    ok: true,
    hireGroupId: data.hireGroupId,
    status: data.status,
    statusLabel: driverHireStatusLabel(data.status),
    vehicleId: data.vehicleId,
    vehicleVrm: data.vehicleVrm,
    vehicleLabel,
    driverLabel,
    startDate: data.startDate,
    rentLabel: formatRentLabel(data.rentAmountGbp, data.rentCadence),
    canManagePayments: can(profile, "rentals.write"),
    canApprovePayments: can(profile, "billing.pay"),
  };
}

export const getHireWorkspaceShell = cache(fetchHireWorkspaceShell);

export type { HireSwitcherOption };

async function fetchHireSwitcherList(): Promise<
  { ok: true; hires: HireSwitcherOption[] } | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const hires = await getCachedHireSwitcherList(companyId);
  return { ok: true, hires };
}

export const loadHireSwitcherList = cache(fetchHireSwitcherList);
