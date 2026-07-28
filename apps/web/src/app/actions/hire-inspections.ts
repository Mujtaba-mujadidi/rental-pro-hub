"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { canWriteRentals } from "@/lib/auth/rental-permissions";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import {
  canCompleteHireCheckin,
  canCompleteHireCheckout,
  type HireInspectionDamageRow,
} from "@/lib/fleet/hire-inspection-lifecycle";
import {
  applyDamageChargesToSettlementBalance,
  isValidDamageChargeResolution,
  parseDamageChargeGbp,
  settlementBalanceAfterPayments,
  summarizeInspectionDamageCharges,
  validateInspectionDamageCharges,
} from "@/lib/fleet/hire-inspection-damage-charges";
import { buildDriverChargeDraftsFromCheckinDamages } from "@/lib/fleet/hire-driver-charges";
import { HIRE_DEPOSIT_REFUND_METHODS } from "@/lib/fleet/hire-termination-summary";
import { signedSettlementBalanceGbp } from "@/lib/fleet/hire-open-balance";
import {
  EMPTY_HIRE_INSPECTION_ACCESSORIES,
  type HireInspectionAccessories,
} from "@/lib/fleet/hire-inspection-accessories";
import { getVehicleLiveTrackAction, setVehicleTrackerMileageAction } from "@/app/actions/fleet-tracking";
import { isFleetTrackingEnabled } from "@/lib/fleet-tracking/credentials";
import { milesToMetres, trackOdometerMatchesMiles } from "@/lib/fleet-tracking/units";
import { syncVehicleStatusForHireGroup } from "@/lib/fleet/sync-vehicle-hire-status";
import { isValidHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";
import {
  HIRE_DAMAGE_SEVERITIES,
  HIRE_DAMAGE_TYPES,
  HIRE_INSPECTION_KINDS,
  isValidVehicleDamagePanelId,
  getVehicleDamagePanel,
  type HireDamageSeverity,
  type HireDamageType,
  type HireInspectionKind,
} from "@/lib/fleet/vehicle-damage-panels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "hire-inspection-media";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type HireInspectionMediaItem = {
  id: string;
  filePath: string;
  signedUrl: string | null;
  caption: string | null;
  damageId: string | null;
  sortOrder: number;
};

export type HireInspectionDamageItem = HireInspectionDamageRow & {
  panelLabel: string;
};

export type HireInspectionPayload = {
  id: string;
  hireGroupId: string;
  vehicleId: string | null;
  kind: HireInspectionKind;
  status: "draft" | "completed";
  odometerReading: number | null;
  fuelLevel: number | null;
  generalNotes: string | null;
  accessories: HireInspectionAccessories;
  completedAt: string | null;
  damages: HireInspectionDamageItem[];
  media: HireInspectionMediaItem[];
  checkoutCompleted: boolean;
  checkinCompleted: boolean;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function assertHireWriteAccess(hireGroupId: string) {
  const { profile } = await requireRentalCompanyArea();
  if (!canWriteRentals(profile)) {
    return { ok: false as const, error: "You do not have permission to manage inspections." };
  }
  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status, vehicle_id, subcompany_id")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!group?.id) return { ok: false as const, error: "Hire not found." };
  return { ok: true as const, profile, group, supabase };
}

function mapAccessories(row: Record<string, unknown> | null | undefined): HireInspectionAccessories {
  if (!row) return { ...EMPTY_HIRE_INSPECTION_ACCESSORIES };
  return {
    hasSpareTyre: (row.has_spare_tyre as boolean | null) ?? null,
    hasTyreKeyLocks: (row.has_tyre_key_locks as boolean | null) ?? null,
    hasTyreInflationKit: (row.has_tyre_inflation_kit as boolean | null) ?? null,
    hasChargingCable: (row.has_charging_cable as boolean | null) ?? null,
    hasTyreReplacementKit: (row.has_tyre_replacement_kit as boolean | null) ?? null,
  };
}

function accessoriesToDb(accessories: HireInspectionAccessories) {
  return {
    has_spare_tyre: accessories.hasSpareTyre,
    has_tyre_key_locks: accessories.hasTyreKeyLocks,
    has_tyre_inflation_kit: accessories.hasTyreInflationKit,
    has_charging_cable: accessories.hasChargingCable,
    has_tyre_replacement_kit: accessories.hasTyreReplacementKit,
  };
}

async function syncTrackerOdometerIfNeeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  vehicleId: string | null | undefined,
  odometerMiles: number | null,
  trackerMetres: number | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!vehicleId?.trim() || odometerMiles == null || odometerMiles < 0) return { ok: true };

  if (trackerMetres != null) {
    if (trackOdometerMatchesMiles(trackerMetres, odometerMiles)) return { ok: true };
  } else {
    const deviceLinked = await isVehicleTrackerDeviceLinked(supabase, companyId, vehicleId);
    if (!deviceLinked) return { ok: true };
  }

  const res = await setVehicleTrackerMileageAction(vehicleId, odometerMiles);
  if (!res.ok) return res;
  return { ok: true };
}

async function resolveInspectionVehicleId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hireGroupId: string,
  vehicleId?: string | null,
): Promise<string | null> {
  const trimmed = vehicleId?.trim();
  if (trimmed) return trimmed;

  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select("vehicle_id")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (error || !data?.vehicle_id) return null;
  return data.vehicle_id as string;
}

async function isVehicleTrackerDeviceLinked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  vehicleId: string,
): Promise<boolean> {
  const enabled = await isFleetTrackingEnabled(companyId);
  if (!enabled) return false;

  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("gps_primary_imei")
    .eq("id", vehicleId)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error || !vehicle?.gps_primary_imei?.trim()) return false;
  return true;
}

async function fetchTrackerOdometerMetres(vehicleId: string): Promise<number | null> {
  const res = await getVehicleLiveTrackAction(vehicleId);
  if (!res.ok || !("linked" in res) || !res.linked) return null;
  const miles = res.snapshot.odometerMiles;
  if (miles == null) return null;
  return Math.round(milesToMetres(miles));
}

function mapDamageRow(row: Record<string, unknown>): HireInspectionDamageItem {
  const panelId = row.panel_id as string;
  return {
    id: row.id as string,
    panelId,
    panelLabel: getVehicleDamagePanel(panelId)?.label ?? panelId.replace(/_/g, " "),
    damageType: row.damage_type as HireDamageType,
    severity: row.severity as HireDamageSeverity,
    notes: (row.notes as string | null) ?? null,
    checkoutDamageId: (row.checkout_damage_id as string | null) ?? null,
    diagramView: (row.diagram_view as HireInspectionDamageItem["diagramView"]) ?? null,
    pinX: (row.pin_x as number | null) ?? null,
    pinY: (row.pin_y as number | null) ?? null,
    chargeGbp:
      row.charge_gbp != null ? Math.round(Number(row.charge_gbp) * 100) / 100 : null,
    chargeResolution: isValidDamageChargeResolution(row.charge_resolution as string)
      ? (row.charge_resolution as HireInspectionDamageItem["chargeResolution"])
      : null,
  };
}

async function loadInspectionPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hireGroupId: string,
  kind: HireInspectionKind,
  vehicleId?: string | null,
): Promise<HireInspectionPayload | null> {
  const resolvedVehicleId = await resolveInspectionVehicleId(supabase, hireGroupId, vehicleId);
  const { data: inspection } = await supabase
    .from("vehicle_hire_inspections")
    .select(
      "id, hire_group_id, kind, status, odometer_reading, fuel_level, general_notes, completed_at, has_spare_tyre, has_tyre_key_locks, has_tyre_inflation_kit, has_charging_cable, has_tyre_replacement_kit",
    )
    .eq("hire_group_id", hireGroupId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: checkoutDone }, { data: checkinDone }] = await Promise.all([
    supabase
      .from("vehicle_hire_inspections")
      .select("id")
      .eq("hire_group_id", hireGroupId)
      .eq("kind", "checkout")
      .eq("status", "completed")
      .maybeSingle(),
    supabase
      .from("vehicle_hire_inspections")
      .select("id")
      .eq("hire_group_id", hireGroupId)
      .eq("kind", "checkin")
      .eq("status", "completed")
      .maybeSingle(),
  ]);

  if (!inspection?.id) {
    return {
      id: "",
      hireGroupId,
      vehicleId: resolvedVehicleId,
      kind,
      status: "draft",
      odometerReading: null,
      fuelLevel: null,
      generalNotes: null,
      accessories: { ...EMPTY_HIRE_INSPECTION_ACCESSORIES },
      completedAt: null,
      damages: [],
      media: [],
      checkoutCompleted: Boolean(checkoutDone?.id),
      checkinCompleted: Boolean(checkinDone?.id),
    };
  }

  const [{ data: damages }, { data: media }] = await Promise.all([
    supabase
      .from("vehicle_hire_inspection_damages")
      .select("id, panel_id, damage_type, severity, notes, checkout_damage_id, diagram_view, pin_x, pin_y, charge_gbp, charge_resolution")
      .eq("inspection_id", inspection.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("vehicle_hire_inspection_media")
      .select("id, file_path, caption, damage_id, sort_order")
      .eq("inspection_id", inspection.id)
      .order("sort_order", { ascending: true }),
  ]);

  const mediaItems: HireInspectionMediaItem[] = [];
  for (const row of media ?? []) {
    const filePath = row.file_path as string;
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600);
    mediaItems.push({
      id: row.id as string,
      filePath,
      signedUrl: signed?.signedUrl ?? null,
      caption: (row.caption as string | null) ?? null,
      damageId: (row.damage_id as string | null) ?? null,
      sortOrder: (row.sort_order as number) ?? 0,
    });
  }

  return {
    id: inspection.id as string,
    hireGroupId,
    vehicleId: resolvedVehicleId,
    kind,
    status: inspection.status as "draft" | "completed",
    odometerReading: (inspection.odometer_reading as number | null) ?? null,
    fuelLevel: (inspection.fuel_level as number | null) ?? null,
    generalNotes: (inspection.general_notes as string | null) ?? null,
    accessories: mapAccessories(inspection as Record<string, unknown>),
    completedAt: (inspection.completed_at as string | null) ?? null,
    damages: (damages ?? []).map((d) => mapDamageRow(d as Record<string, unknown>)),
    media: mediaItems,
    checkoutCompleted: Boolean(checkoutDone?.id),
    checkinCompleted: Boolean(checkinDone?.id),
  };
}

async function getOrCreateDraftInspection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hireGroupId: string,
  parentCompanyId: string,
  kind: HireInspectionKind,
): Promise<{ ok: true; inspectionId: string } | { ok: false; error: string }> {
  const { data: existing } = await supabase
    .from("vehicle_hire_inspections")
    .select("id, status")
    .eq("hire_group_id", hireGroupId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    if (existing.status === "completed") {
      return { ok: false, error: "This inspection is already completed." };
    }
    return { ok: true, inspectionId: existing.id as string };
  }

  const { data: created, error } = await supabase
    .from("vehicle_hire_inspections")
    .insert({
      hire_group_id: hireGroupId,
      parent_company_id: parentCompanyId,
      kind,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !created?.id) return { ok: false, error: error?.message ?? "Could not start inspection." };
  return { ok: true, inspectionId: created.id as string };
}

function revalidateHirePaths(hireGroupId: string, vehicleId?: string | null) {
  revalidatePath(`/rental/hires/${hireGroupId}`);
  revalidatePath(`/rental/hires/${hireGroupId}/checkout`);
  revalidatePath(`/rental/hires/${hireGroupId}/checkin`);
  revalidatePath(`/rental/hires/${hireGroupId}/settlement`);
  revalidatePath(`/rental/balances/${hireGroupId}`);
  revalidatePath("/rental/balances");
  if (vehicleId) {
    revalidatePath(`/rental/vehicles/${vehicleId}/rentals`);
    revalidatePath(`/rental/vehicles/${vehicleId}/financials`);
  }
}

export type HireInspectionPaymentAccountOption = {
  id: string;
  name: string;
  isDefault: boolean;
};

export async function loadHireInspectionPaymentAccountsAction(
  hireGroupId: string,
): Promise<
  | { ok: true; accounts: HireInspectionPaymentAccountOption[]; defaultPaymentAccountId: string | null }
  | { ok: false; error: string }
> {
  const access = await assertHireWriteAccess(hireGroupId);
  if (!access.ok) return access;

  const { data: group, error } = await access.supabase
    .from("vehicle_hire_groups")
    .select("parent_company_id, default_payment_account_id")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group) return { ok: false, error: "Hire not found." };

  const defaultPaymentAccountId = (group.default_payment_account_id as string | null) ?? null;
  const { data: accounts, error: accountsError } = await access.supabase
    .from("company_payment_accounts")
    .select("id, name")
    .eq("parent_company_id", group.parent_company_id as string)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (accountsError) return { ok: false, error: accountsError.message };

  return {
    ok: true,
    accounts: (accounts ?? []).map((account) => ({
      id: account.id as string,
      name: (account.name as string)?.trim() || "Account",
      isDefault: (account.id as string) === defaultPaymentAccountId,
    })),
    defaultPaymentAccountId,
  };
}

export async function loadHireInspectionAction(
  hireGroupId: string,
  kind: HireInspectionKind,
): Promise<ActionResult<HireInspectionPayload>> {
  if (!HIRE_INSPECTION_KINDS.includes(kind)) return { ok: false, error: "Invalid inspection type." };
  const access = await assertHireWriteAccess(hireGroupId);
  if (!access.ok) return access;

  const vehicleId = access.group.vehicle_id as string | null;
  const data = await loadInspectionPayload(access.supabase, hireGroupId, kind, vehicleId);
  if (!data) return { ok: false, error: "Could not load inspection." };

  const { getVehicleDamagePanel } = await import("@/lib/fleet/vehicle-damage-panels");
  data.damages = data.damages.map((d) => ({
    ...d,
    panelLabel: getVehicleDamagePanel(d.panelId)?.label ?? d.panelId,
  }));

  if (kind === "checkin" && data.checkoutCompleted) {
    const checkout = await loadInspectionPayload(access.supabase, hireGroupId, "checkout", vehicleId);
    if (checkout?.damages.length) {
      const checkoutByPanel = new Map(checkout.damages.map((d) => [d.panelId, d]));
      data.damages = data.damages.map((d) => {
        if (d.checkoutDamageId) return d;
        const match = checkoutByPanel.get(d.panelId);
        if (match && match.damageType === d.damageType && match.severity === d.severity) {
          return { ...d, checkoutDamageId: match.id };
        }
        return d;
      });
    }
  }

  return { ok: true, data };
}

export type HireInspectionDamageDraftInput = {
  id?: string | null;
  panelId: string;
  damageType: HireDamageType;
  severity: HireDamageSeverity;
  notes?: string | null;
  checkoutDamageId?: string | null;
  diagramView?: string | null;
  pinX?: number | null;
  pinY?: number | null;
  chargeGbp?: number | null;
  chargeResolution?: string | null;
};

function validateDamageDraftInput(input: HireInspectionDamageDraftInput): string | null {
  if (!isValidVehicleDamagePanelId(input.panelId)) return "Invalid panel.";
  if (!HIRE_DAMAGE_TYPES.includes(input.damageType)) return "Invalid damage type.";
  if (!HIRE_DAMAGE_SEVERITIES.includes(input.severity)) return "Invalid severity.";
  const diagramView = input.diagramView?.trim() || null;
  if (
    diagramView &&
    !["left_side", "front", "right_side", "spare", "rear", "top"].includes(diagramView)
  ) {
    return "Invalid diagram view.";
  }
  const pinX = input.pinX ?? null;
  const pinY = input.pinY ?? null;
  if ((pinX == null) !== (pinY == null)) {
    return "Pin coordinates must be provided together.";
  }
  const chargeGbp = parseDamageChargeGbp(input.chargeGbp);
  if (input.chargeGbp != null && chargeGbp == null) {
    return "Enter a valid damage charge amount.";
  }
  if (
    input.chargeResolution &&
    !isValidDamageChargeResolution(input.chargeResolution)
  ) {
    return "Invalid damage charge resolution.";
  }
  if (chargeGbp != null && chargeGbp > 0 && !input.chargeResolution) {
    return "Choose how to resolve each damage charge.";
  }
  return null;
}

async function syncInspectionDamagesDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inspectionId: string,
  damages: HireInspectionDamageDraftInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const damage of damages) {
    const validationError = validateDamageDraftInput(damage);
    if (validationError) return { ok: false, error: validationError };
  }

  const { error: deleteError } = await supabase
    .from("vehicle_hire_inspection_damages")
    .delete()
    .eq("inspection_id", inspectionId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (!damages.length) return { ok: true };

  const { error: insertError } = await supabase.from("vehicle_hire_inspection_damages").insert(
    damages.map((damage) => ({
      inspection_id: inspectionId,
      panel_id: damage.panelId,
      damage_type: damage.damageType,
      severity: damage.severity,
      notes: damage.notes?.trim() || null,
      checkout_damage_id: damage.checkoutDamageId ?? null,
      diagram_view: damage.diagramView?.trim() || null,
      pin_x: damage.pinX ?? null,
      pin_y: damage.pinY ?? null,
      charge_gbp: parseDamageChargeGbp(damage.chargeGbp),
      charge_resolution: isValidDamageChargeResolution(damage.chargeResolution ?? null)
        ? damage.chargeResolution
        : null,
    })),
  );
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true };
}

export async function saveHireInspectionDraftAction(input: {
  hireGroupId: string;
  kind: HireInspectionKind;
  odometerReading?: number | null;
  fuelLevel?: number | null;
  generalNotes?: string | null;
  accessories?: HireInspectionAccessories;
  damages?: HireInspectionDamageDraftInput[];
  syncTrackerOdometer?: boolean;
}): Promise<ActionResult<{ inspectionId: string }>> {
  const access = await assertHireWriteAccess(input.hireGroupId);
  if (!access.ok) return access;

  const draft = await getOrCreateDraftInspection(
    access.supabase,
    input.hireGroupId,
    access.group.parent_company_id as string,
    input.kind,
  );
  if (!draft.ok) return draft;

  if (!isValidHireFuelLevelPercent(input.fuelLevel)) {
    return { ok: false, error: "Fuel level must be between 0 and 100." };
  }

  const { error } = await access.supabase
    .from("vehicle_hire_inspections")
    .update({
      odometer_reading: input.odometerReading ?? null,
      fuel_level: input.fuelLevel ?? null,
      general_notes: input.generalNotes?.trim() || null,
      ...(input.accessories ? accessoriesToDb(input.accessories) : {}),
    })
    .eq("id", draft.inspectionId);

  if (error) return { ok: false, error: error.message };

  if (input.damages) {
    const sync = await syncInspectionDamagesDraft(
      access.supabase,
      draft.inspectionId,
      input.damages,
    );
    if (!sync.ok) return sync;
  }

  if (input.syncTrackerOdometer && input.odometerReading != null) {
    const vehicleId = access.group.vehicle_id as string;
    const trackerMetres = await fetchTrackerOdometerMetres(vehicleId);
    const sync = await syncTrackerOdometerIfNeeded(
      access.supabase,
      access.group.parent_company_id as string,
      vehicleId,
      input.odometerReading,
      trackerMetres,
    );
    if (!sync.ok) return sync;
  }
  revalidateHirePaths(input.hireGroupId, access.group.vehicle_id as string);
  return { ok: true, data: { inspectionId: draft.inspectionId } };
}

export async function upsertHireInspectionDamageAction(input: {
  hireGroupId: string;
  kind: HireInspectionKind;
  damageId?: string | null;
  panelId: string;
  damageType: HireDamageType;
  severity: HireDamageSeverity;
  notes?: string | null;
  checkoutDamageId?: string | null;
  diagramView?: string | null;
  pinX?: number | null;
  pinY?: number | null;
}): Promise<ActionResult<{ damageId: string }>> {
  if (!isValidVehicleDamagePanelId(input.panelId)) return { ok: false, error: "Invalid panel." };
  if (!HIRE_DAMAGE_TYPES.includes(input.damageType)) return { ok: false, error: "Invalid damage type." };
  if (!HIRE_DAMAGE_SEVERITIES.includes(input.severity)) return { ok: false, error: "Invalid severity." };
  const diagramView = input.diagramView?.trim() || null;
  if (
    diagramView &&
    !["left_side", "front", "right_side", "spare", "rear", "top"].includes(diagramView)
  ) {
    return { ok: false, error: "Invalid diagram view." };
  }
  const pinX = input.pinX ?? null;
  const pinY = input.pinY ?? null;
  if ((pinX == null) !== (pinY == null)) {
    return { ok: false, error: "Pin coordinates must be provided together." };
  }

  const access = await assertHireWriteAccess(input.hireGroupId);
  if (!access.ok) return access;

  const draft = await getOrCreateDraftInspection(
    access.supabase,
    input.hireGroupId,
    access.group.parent_company_id as string,
    input.kind,
  );
  if (!draft.ok) return draft;

  if (input.damageId) {
    const { data, error } = await access.supabase
      .from("vehicle_hire_inspection_damages")
      .update({
        panel_id: input.panelId,
        damage_type: input.damageType,
        severity: input.severity,
        notes: input.notes?.trim() || null,
        checkout_damage_id: input.checkoutDamageId ?? null,
        diagram_view: diagramView,
        pin_x: pinX,
        pin_y: pinY,
      })
      .eq("id", input.damageId)
      .eq("inspection_id", draft.inspectionId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data?.id) return { ok: false, error: "Damage not found." };
    revalidateHirePaths(input.hireGroupId, access.group.vehicle_id as string);
    return { ok: true, data: { damageId: data.id as string } };
  }

  const { data, error } = await access.supabase
    .from("vehicle_hire_inspection_damages")
    .insert({
      inspection_id: draft.inspectionId,
      panel_id: input.panelId,
      damage_type: input.damageType,
      severity: input.severity,
      notes: input.notes?.trim() || null,
      checkout_damage_id: input.checkoutDamageId ?? null,
      diagram_view: diagramView,
      pin_x: pinX,
      pin_y: pinY,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateHirePaths(input.hireGroupId, access.group.vehicle_id as string);
  return { ok: true, data: { damageId: data.id as string } };
}

export async function deleteHireInspectionDamageAction(input: {
  hireGroupId: string;
  damageId: string;
}): Promise<ActionResult<null>> {
  const access = await assertHireWriteAccess(input.hireGroupId);
  if (!access.ok) return access;

  const { error } = await access.supabase
    .from("vehicle_hire_inspection_damages")
    .delete()
    .eq("id", input.damageId);

  if (error) return { ok: false, error: error.message };
  revalidateHirePaths(input.hireGroupId, access.group.vehicle_id as string);
  return { ok: true, data: null };
}

function extForMime(mime: string): string | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

export async function uploadHireInspectionMediaAction(
  formData: FormData,
): Promise<ActionResult<{ mediaId: string }>> {
  const hireGroupId = String(formData.get("hireGroupId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim() as HireInspectionKind;
  const file = formData.get("file");

  if (!hireGroupId || !HIRE_INSPECTION_KINDS.includes(kind)) {
    return { ok: false, error: "Invalid upload request." };
  }
  if (!file || typeof file === "string" || file.size === 0) {
    return { ok: false, error: "Choose a photo to upload." };
  }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image must be 5 MB or smaller." };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: "Use JPEG, PNG, or WebP images." };
  }

  const access = await assertHireWriteAccess(hireGroupId);
  if (!access.ok) return access;

  const draft = await getOrCreateDraftInspection(
    access.supabase,
    hireGroupId,
    access.group.parent_company_id as string,
    kind,
  );
  if (!draft.ok) return draft;

  const ext = extForMime(file.type);
  if (!ext) return { ok: false, error: "Unsupported image type." };

  const companyId = access.group.parent_company_id as string;
  const path = `${companyId}/${hireGroupId}/${draft.inspectionId}/${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await access.supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: media, error } = await access.supabase
    .from("vehicle_hire_inspection_media")
    .insert({
      inspection_id: draft.inspectionId,
      file_path: path,
      uploaded_by_user_id: access.profile.id,
    })
    .select("id")
    .single();

  if (error) {
    await access.supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }

  revalidateHirePaths(hireGroupId, access.group.vehicle_id as string);
  return { ok: true, data: { mediaId: media.id as string } };
}

async function syncInspectionMediaDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inspectionId: string,
  companyId: string,
  hireGroupId: string,
  userId: string,
  keepMediaIds: string[],
  newFiles: File[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: existingError } = await supabase
    .from("vehicle_hire_inspection_media")
    .select("id, file_path")
    .eq("inspection_id", inspectionId);
  if (existingError) return { ok: false, error: existingError.message };

  const keepSet = new Set(keepMediaIds);
  const toDelete = (existing ?? []).filter((row) => !keepSet.has(row.id as string));

  for (const row of toDelete) {
    const { error: deleteError } = await supabase
      .from("vehicle_hire_inspection_media")
      .delete()
      .eq("id", row.id as string);
    if (deleteError) return { ok: false, error: deleteError.message };
    if (row.file_path) {
      await supabase.storage.from(BUCKET).remove([row.file_path as string]);
    }
  }

  let sortOrder = 0;
  for (const mediaId of keepMediaIds) {
    const { error } = await supabase
      .from("vehicle_hire_inspection_media")
      .update({ sort_order: sortOrder })
      .eq("id", mediaId)
      .eq("inspection_id", inspectionId);
    if (error) return { ok: false, error: error.message };
    sortOrder += 1;
  }

  for (const file of newFiles) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image must be 5 MB or smaller." };
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return { ok: false, error: "Use JPEG, PNG, or WebP images." };
    }
    const ext = extForMime(file.type);
    if (!ext) return { ok: false, error: "Unsupported image type." };

    const path = `${companyId}/${hireGroupId}/${inspectionId}/${Date.now()}-${sortOrder}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) return { ok: false, error: uploadError.message };

    const { error: insertError } = await supabase.from("vehicle_hire_inspection_media").insert({
      inspection_id: inspectionId,
      file_path: path,
      sort_order: sortOrder,
      uploaded_by_user_id: userId,
    });
    if (insertError) {
      await supabase.storage.from(BUCKET).remove([path]);
      return { ok: false, error: insertError.message };
    }
    sortOrder += 1;
  }

  return { ok: true };
}

export async function syncHireInspectionMediaDraftAction(
  formData: FormData,
): Promise<ActionResult<null>> {
  const hireGroupId = String(formData.get("hireGroupId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim() as HireInspectionKind;
  const keepMediaIdsRaw = String(formData.get("keepMediaIds") ?? "[]");

  if (!hireGroupId || !HIRE_INSPECTION_KINDS.includes(kind)) {
    return { ok: false, error: "Invalid media sync request." };
  }

  let keepMediaIds: string[] = [];
  try {
    const parsed = JSON.parse(keepMediaIdsRaw);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) {
      return { ok: false, error: "Invalid media manifest." };
    }
    keepMediaIds = parsed;
  } catch {
    return { ok: false, error: "Invalid media manifest." };
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const access = await assertHireWriteAccess(hireGroupId);
  if (!access.ok) return access;

  const draft = await getOrCreateDraftInspection(
    access.supabase,
    hireGroupId,
    access.group.parent_company_id as string,
    kind,
  );
  if (!draft.ok) return draft;

  const sync = await syncInspectionMediaDraft(
    access.supabase,
    draft.inspectionId,
    access.group.parent_company_id as string,
    hireGroupId,
    access.profile.id,
    keepMediaIds,
    files,
  );
  if (!sync.ok) return sync;

  revalidateHirePaths(hireGroupId, access.group.vehicle_id as string);
  return { ok: true, data: null };
}

export async function deleteHireInspectionMediaAction(input: {
  hireGroupId: string;
  mediaId: string;
}): Promise<ActionResult<null>> {
  const access = await assertHireWriteAccess(input.hireGroupId);
  if (!access.ok) return access;

  const { data: media } = await access.supabase
    .from("vehicle_hire_inspection_media")
    .select("id, file_path, inspection_id")
    .eq("id", input.mediaId)
    .maybeSingle();
  if (!media?.id) return { ok: false, error: "Photo not found." };

  const { error } = await access.supabase.from("vehicle_hire_inspection_media").delete().eq("id", input.mediaId);
  if (error) return { ok: false, error: error.message };

  if (media.file_path) {
    await access.supabase.storage.from(BUCKET).remove([media.file_path as string]);
  }

  revalidateHirePaths(input.hireGroupId, access.group.vehicle_id as string);
  return { ok: true, data: null };
}

export async function completeHireCheckoutAction(
  hireGroupId: string,
): Promise<ActionResult<null>> {
  const access = await assertHireWriteAccess(hireGroupId);
  if (!access.ok) return access;

  const payload = await loadInspectionPayload(
    access.supabase,
    hireGroupId,
    "checkout",
    access.group.vehicle_id as string | null,
  );
  if (!payload?.id) return { ok: false, error: "Start checkout before completing." };
  if (payload.status === "completed") return { ok: false, error: "Checkout is already completed." };

  const guard = canCompleteHireCheckout({
    hireStatus: access.group.status as string,
    mediaCount: payload.media.length,
  });
  if (!guard.ok) return guard;

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const userId = access.profile.id;

  const { error: inspectionError } = await admin
    .from("vehicle_hire_inspections")
    .update({
      status: "completed",
      completed_at: now,
      completed_by_user_id: userId,
    })
    .eq("id", payload.id);

  if (inspectionError) return { ok: false, error: inspectionError.message };

  const hireStatus = access.group.status as string;
  if (hireStatus === "reserved") {
    const { error: hireError } = await admin
      .from("vehicle_hire_groups")
      .update({ status: "active", activated_at: now })
      .eq("id", hireGroupId);

    if (hireError) return { ok: false, error: hireError.message };
  }

  await syncVehicleStatusForHireGroup(admin, hireGroupId);
  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "checkout_completed",
    summary:
      hireStatus === "active"
        ? "Vehicle checkout completed (recorded after hire started)."
        : "Vehicle checkout completed — hire is now active.",
    actorRole: "company_staff",
    actorUserId: userId,
  });

  revalidateHirePaths(hireGroupId, access.group.vehicle_id as string);
  return { ok: true, data: null };
}

export async function completeHireCheckinAction(
  hireGroupId: string,
  input?: {
    damagePaymentMethod?: string;
    damagePaymentAccountId?: string;
    damagePaymentReference?: string;
  },
): Promise<ActionResult<null>> {
  const access = await assertHireWriteAccess(hireGroupId);
  if (!access.ok) return access;

  const payload = await loadInspectionPayload(
    access.supabase,
    hireGroupId,
    "checkin",
    access.group.vehicle_id as string | null,
  );
  if (!payload?.id) return { ok: false, error: "Start check-in before completing." };
  if (payload.status === "completed") return { ok: false, error: "Check-in is already completed." };

  const guard = canCompleteHireCheckin({
    hireStatus: access.group.status as string,
    checkoutCompleted: payload.checkoutCompleted,
    mediaCount: payload.media.length,
  });
  if (!guard.ok) return guard;

  const damageChargeError = validateInspectionDamageCharges(payload.damages);
  if (damageChargeError) return { ok: false, error: damageChargeError };

  const chargeSummary = summarizeInspectionDamageCharges(payload.damages);

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const userId = access.profile.id;

  const { data: hireGroup, error: hireGroupError } = await admin
    .from("vehicle_hire_groups")
    .select(
      "settlement_balance_gbp, settlement_balance_direction, parent_company_id, default_payment_account_id",
    )
    .eq("id", hireGroupId)
    .maybeSingle();
  if (hireGroupError) return { ok: false, error: hireGroupError.message };
  if (!hireGroup) return { ok: false, error: "Hire not found." };

  const paymentMethod = input?.damagePaymentMethod?.trim() ?? "";
  const paymentAccountId =
    input?.damagePaymentAccountId?.trim() ||
    ((hireGroup.default_payment_account_id as string | null) ?? null);

  if (chargeSummary.paidNowGbp > 0) {
    if (!(HIRE_DEPOSIT_REFUND_METHODS as readonly string[]).includes(paymentMethod)) {
      return { ok: false, error: "Select how the on-the-spot damage payment was received." };
    }
    if (!paymentAccountId) {
      return { ok: false, error: "Select the payment account for on-the-spot damage charges." };
    }
  }

  if (chargeSummary.addToBalanceGbp > 0 || chargeSummary.paidNowGbp > 0) {
    const initialDirection = hireGroup.settlement_balance_direction as
      | "driver_owes_company"
      | "company_owes_driver"
      | "settled"
      | null;
    const initialAmountGbp = Number(hireGroup.settlement_balance_gbp ?? 0);
    const initialSigned = signedSettlementBalanceGbp(
      initialDirection ?? "settled",
      initialAmountGbp,
    );

    let balanceDirection = initialDirection ?? "settled";
    let balanceAmountGbp = initialAmountGbp;
    let damagePaymentId: string | null = null;

    if (chargeSummary.addToBalanceGbp > 0) {
      const balanceAfterCharges = applyDamageChargesToSettlementBalance({
        settlementBalanceDirection: balanceDirection,
        settlementBalanceGbp: balanceAmountGbp,
        addToBalanceGbp: chargeSummary.addToBalanceGbp,
      });
      balanceDirection = balanceAfterCharges.settlementBalanceDirection;
      balanceAmountGbp = balanceAfterCharges.settlementBalanceGbp;

      const { error: balanceUpdateError } = await admin
        .from("vehicle_hire_groups")
        .update({
          settlement_balance_direction: balanceDirection,
          settlement_balance_gbp: balanceAmountGbp,
        })
        .eq("id", hireGroupId);
      if (balanceUpdateError) return { ok: false, error: balanceUpdateError.message };
    }

    if (chargeSummary.paidNowGbp > 0) {
      const accountId =
        paymentAccountId || (hireGroup.default_payment_account_id as string | null);
      const { data: account } = await admin
        .from("company_payment_accounts")
        .select("id")
        .eq("id", accountId)
        .eq("parent_company_id", hireGroup.parent_company_id as string)
        .eq("is_active", true)
        .maybeSingle();
      if (!account?.id) return { ok: false, error: "Payment account not found." };

      const { data: paymentRow, error: paymentError } = await admin
        .from("vehicle_hire_balance_payments")
        .insert({
          hire_group_id: hireGroupId,
          amount_gbp: chargeSummary.paidNowGbp,
          payment_method: paymentMethod,
          payment_account_id: account.id,
          payment_reference: input?.damagePaymentReference?.trim() || null,
          direction: "received_from_driver",
          payment_category: "driver_charge",
          notes: "Damage charge collected at vehicle check-in",
          recorded_by_user_id: userId,
        })
        .select("id")
        .single();
      if (paymentError) return { ok: false, error: paymentError.message };
      damagePaymentId = (paymentRow?.id as string | undefined) ?? null;

      const hadOpenBalanceToApply =
        chargeSummary.addToBalanceGbp > 0 || Math.abs(initialSigned) > 0.005;
      if (hadOpenBalanceToApply) {
        const { data: payments } = await admin
          .from("vehicle_hire_balance_payments")
          .select("amount_gbp, direction")
          .eq("hire_group_id", hireGroupId);
        const remaining = settlementBalanceAfterPayments({
          settlementBalanceDirection: balanceDirection,
          settlementBalanceGbp: balanceAmountGbp,
          payments: (payments ?? []).map((payment) => ({
            amountGbp: Number(payment.amount_gbp ?? 0),
            direction:
              (payment.direction as "received_from_driver" | "paid_to_driver" | null) ??
              "received_from_driver",
          })),
        });
        const { error: remainingError } = await admin
          .from("vehicle_hire_groups")
          .update({
            settlement_balance_direction: remaining.settlementBalanceDirection,
            settlement_balance_gbp: remaining.settlementBalanceGbp,
          })
          .eq("id", hireGroupId);
        if (remainingError) return { ok: false, error: remainingError.message };
      }
    }

    const chargeDrafts = buildDriverChargeDraftsFromCheckinDamages(
      payload.damages.map((damage) => ({
        id: damage.id,
        panelId: damage.panelId,
        panelLabel: damage.panelLabel,
        damageType: damage.damageType,
        severity: damage.severity,
        checkoutDamageId: damage.checkoutDamageId,
        chargeGbp: damage.chargeGbp,
        chargeResolution: damage.chargeResolution,
      })),
    );
    if (chargeDrafts.length > 0) {
      const { error: lineItemsError } = await admin
        .from("vehicle_hire_driver_charge_line_items")
        .insert(
          chargeDrafts.map((draft) => ({
            hire_group_id: hireGroupId,
            parent_company_id: hireGroup.parent_company_id as string,
            charge_type: draft.chargeType,
            amount_gbp: draft.amountGbp,
            resolution: draft.resolution,
            source_kind: draft.sourceKind,
            source_id: draft.sourceId ?? null,
            description: draft.description ?? null,
            balance_payment_id: draft.resolution === "paid_now" ? damagePaymentId : null,
            created_by_user_id: userId,
          })),
        );
      if (lineItemsError) return { ok: false, error: lineItemsError.message };
    }
  }

  const { error: inspectionError } = await admin
    .from("vehicle_hire_inspections")
    .update({
      status: "completed",
      completed_at: now,
      completed_by_user_id: userId,
    })
    .eq("id", payload.id);

  if (inspectionError) return { ok: false, error: inspectionError.message };

  const { error: hireError } = await admin
    .from("vehicle_hire_groups")
    .update({ status: "completed", ended_at: now })
    .eq("id", hireGroupId);

  if (hireError) return { ok: false, error: hireError.message };

  await syncVehicleStatusForHireGroup(admin, hireGroupId);
  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "checkin_completed",
    summary:
      chargeSummary.addToBalanceGbp > 0 || chargeSummary.paidNowGbp > 0
        ? `Vehicle check-in completed — damage charges applied (£${(chargeSummary.addToBalanceGbp + chargeSummary.paidNowGbp).toFixed(2)}).`
        : "Vehicle check-in completed — hire ended.",
    actorRole: "company_staff",
    actorUserId: userId,
  });

  revalidateHirePaths(hireGroupId, access.group.vehicle_id as string);
  return { ok: true, data: null };
}

export async function loadHireInspectionTrackerOdometerAction(input: {
  hireGroupId: string;
  vehicleId?: string | null;
}): Promise<
  | { ok: true; linked: false }
  | { ok: true; linked: true; odometerMiles: number | null; liveUnavailable: boolean }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const vehicleId = await resolveInspectionVehicleId(
    supabase,
    input.hireGroupId.trim(),
    input.vehicleId,
  );
  if (!vehicleId) return { ok: true, linked: false };

  const deviceLinked = await isVehicleTrackerDeviceLinked(supabase, companyId, vehicleId);
  if (!deviceLinked) return { ok: true, linked: false };

  const live = await getVehicleLiveTrackAction(vehicleId);
  if (!live.ok) {
    return { ok: true, linked: true, odometerMiles: null, liveUnavailable: true };
  }
  if (!live.linked) {
    return { ok: true, linked: true, odometerMiles: null, liveUnavailable: true };
  }

  return {
    ok: true,
    linked: true,
    odometerMiles: live.snapshot.odometerMiles,
    liveUnavailable: false,
  };
}

async function assertDriverOwnsHireGroup(
  hireGroupId: string,
  userId: string,
): Promise<{ ok: true; supabase: Awaited<ReturnType<typeof createClient>> } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id")
    .eq("id", hireGroupId.trim())
    .eq("driver_user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "Hire not found." };
  return { ok: true, supabase };
}

/** Driver read-only view of checkout / check-in inspections for their hire. */
export async function loadDriverHireInspectionAction(
  hireGroupId: string,
  kind: HireInspectionKind,
): Promise<ActionResult<HireInspectionPayload>> {
  if (!HIRE_INSPECTION_KINDS.includes(kind)) return { ok: false, error: "Invalid inspection type." };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const access = await assertDriverOwnsHireGroup(hireGroupId, user.id);
  if (!access.ok) return access;

  const { data: hireGroup } = await access.supabase
    .from("vehicle_hire_groups")
    .select("vehicle_id")
    .eq("id", hireGroupId)
    .maybeSingle();
  const vehicleId = (hireGroup?.vehicle_id as string | null) ?? null;

  const data = await loadInspectionPayload(access.supabase, hireGroupId, kind, vehicleId);
  if (!data) return { ok: false, error: "Could not load inspection." };

  const { getVehicleDamagePanel } = await import("@/lib/fleet/vehicle-damage-panels");
  data.damages = data.damages.map((d) => ({
    ...d,
    panelLabel: getVehicleDamagePanel(d.panelId)?.label ?? d.panelId,
  }));

  if (kind === "checkin" && data.checkoutCompleted) {
    const checkout = await loadInspectionPayload(access.supabase, hireGroupId, "checkout", vehicleId);
    if (checkout?.damages.length) {
      const checkoutByPanel = new Map(checkout.damages.map((d) => [d.panelId, d]));
      data.damages = data.damages.map((d) => {
        if (d.checkoutDamageId) return d;
        const match = checkoutByPanel.get(d.panelId);
        if (match && match.damageType === d.damageType && match.severity === d.severity) {
          return { ...d, checkoutDamageId: match.id };
        }
        return d;
      });
    }
  }

  return { ok: true, data };
}
