"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canWriteRentals } from "@/lib/auth/rental-permissions";
import { assertStaffHireSubcompanyAccess } from "@/lib/auth/rental-subcompany-access";
import { ukTodayYmd } from "@/lib/datetime/uk";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import {
  EMPTY_HIRE_INSPECTION_ACCESSORIES,
  type HireInspectionAccessoryKey,
} from "@/lib/fleet/hire-inspection-accessories";
import {
  applyDamageChargesToSettlementBalance,
  applySignedChargeDeltaToSettlementBalance,
  isValidDamageChargeResolution,
  parseDamageChargeGbp,
  type HireInspectionDamageChargeResolution,
} from "@/lib/fleet/hire-inspection-damage-charges";
import { isHireEndHireFinalized, parseHireEndHireDraft, type HireEndHireDraft, type HireEndHireReturnChargesDraft } from "@/lib/fleet/hire-end-hire";
import { revalidateHireWorkspaceCache } from "@/lib/fleet/hire-workspace-cache";
import {
  buildReturnChargeLineItemDrafts,
  HIRE_RETURN_CHARGE_SOURCE_KINDS,
  sumLineItemAddToBalanceGbp,
  validateOptionalReturnCharge,
  validateReturnDamageCharges,
  type HireReturnChargeAccessoryInput,
  type HireReturnChargeDamageInput,
  type HireReturnChargeOptionalInput,
} from "@/lib/fleet/hire-return-charges";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadHireInspectionAction } from "@/app/actions/hire-inspections";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type HireReturnChargesPageData = {
  checkinCompleted: boolean;
  checkinInspectionId: string | null;
  checkoutFuelLevel: number | null;
  checkinFuelLevel: number | null;
  fuelShortfall: boolean;
  missingAccessories: HireInspectionAccessoryKey[];
  newDamages: Array<{
    id: string;
    panelId: string;
    panelLabel: string;
    damageType: string;
    severity: string;
    notes: string | null;
    chargeGbp: number | null;
    chargeResolution: HireInspectionDamageChargeResolution | null;
  }>;
  appliedFuelCharge: {
    amountGbp: number;
    resolution: string;
  } | null;
  fuelReviewLater: boolean;
  appliedAccessoryCharges: Array<{
    key: HireInspectionAccessoryKey;
    amountGbp: number;
    resolution: string;
  }>;
  accessoryReviewsLater: HireInspectionAccessoryKey[];
  returnChargesDraftSavedAt: string | null;
  returnChargesAppliedAt: string | null;
  returnChargesReady: boolean;
};

async function authorizeReturnChargesWrite(hireGroupId: string): Promise<
  | {
      ok: true;
      hire: {
        id: string;
        status: string;
        parentCompanyId: string;
        endHireDraft: HireEndHireDraft | null;
        vehicleId: string | null;
      };
      userId: string;
    }
  | { ok: false; error: string }
> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, status, parent_company_id, subcompany_id, end_hire_draft, vehicle_id")
    .eq("id", id)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group) return { ok: false, error: "Hire not found." };

  const scope = await assertStaffHireSubcompanyAccess(
    profile,
    (group.subcompany_id as string | null) ?? null,
  );
  if (!scope.ok) return scope;

  return {
    ok: true,
    hire: {
      id: group.id as string,
      status: group.status as string,
      parentCompanyId: group.parent_company_id as string,
      endHireDraft: parseHireEndHireDraft(group.end_hire_draft),
      vehicleId: (group.vehicle_id as string | null) ?? null,
    },
    userId: user.id,
  };
}

function revalidateReturnChargePaths(hireGroupId: string, vehicleId: string | null) {
  revalidatePath(`/rental/hires/${hireGroupId}`);
  revalidatePath(`/rental/hires/${hireGroupId}/end-hire`);
  revalidatePath(`/rental/hires/${hireGroupId}/payments`);
  revalidatePath(`/rental/hires/${hireGroupId}/checkin`);
  if (vehicleId) revalidatePath(`/rental/vehicles/${vehicleId}`);
  revalidateHireWorkspaceCache(hireGroupId);
}

export async function loadHireReturnChargesAction(
  hireGroupId: string,
): Promise<ActionResult<HireReturnChargesPageData>> {
  const authorized = await authorizeReturnChargesWrite(hireGroupId);
  if (!authorized.ok) return authorized;

  const { listMissingAccessoryItems, hasFuelReturnShortfall, areReturnChargesReady } = await import(
    "@/lib/fleet/hire-return-charges"
  );

  const [checkoutRes, checkinRes, lineItemsRes] = await Promise.all([
    loadHireInspectionAction(hireGroupId, "checkout"),
    loadHireInspectionAction(hireGroupId, "checkin"),
    (async () => {
      const supabase = await createClient();
      return supabase
        .from("vehicle_hire_driver_charge_line_items")
        .select("source_kind, source_id, amount_gbp, resolution")
        .eq("hire_group_id", hireGroupId)
        .in("source_kind", [...HIRE_RETURN_CHARGE_SOURCE_KINDS]);
    })(),
  ]);

  const checkout = checkoutRes.ok ? checkoutRes.data : null;
  const checkin = checkinRes.ok ? checkinRes.data : null;

  const checkoutAccessories = checkout?.accessories ?? { ...EMPTY_HIRE_INSPECTION_ACCESSORIES };
  const checkinAccessories = checkin?.accessories ?? { ...EMPTY_HIRE_INSPECTION_ACCESSORIES };
  const missingAccessories = listMissingAccessoryItems(checkoutAccessories, checkinAccessories);

  const checkoutFuelLevel = checkout?.fuelLevel ?? null;
  const checkinFuelLevel = checkin?.fuelLevel ?? null;
  const fuelShortfall = hasFuelReturnShortfall(checkoutFuelLevel, checkinFuelLevel);

  const newDamagesBase = (checkin?.damages ?? [])
    .filter((damage) => damage.checkoutDamageId == null)
    .map((damage) => ({
      id: damage.id,
      panelId: damage.panelId,
      panelLabel: damage.panelLabel,
      damageType: damage.damageType,
      severity: damage.severity,
      notes: damage.notes,
      checkoutDamageId: damage.checkoutDamageId,
      chargeGbp: damage.chargeGbp,
      chargeResolution: damage.chargeResolution,
    }));

  const savedDraft = authorized.hire.endHireDraft?.returnChargesDraft ?? null;
  const newDamages = mergeReturnChargesDraftIntoDamages(newDamagesBase, savedDraft);

  const lineItems = lineItemsRes.data ?? [];
  const fuelLine = lineItems.find((row) => row.source_kind === "checkin_inspection_fuel");
  let appliedFuelCharge =
    fuelLine && Number(fuelLine.amount_gbp) > 0
      ? {
          amountGbp: Number(fuelLine.amount_gbp),
          resolution: fuelLine.resolution as string,
        }
      : null;
  let appliedAccessoryCharges = lineItems
    .filter((row) => row.source_kind === "checkin_inspection_accessory")
    .map((row) => ({
      key: row.source_id as HireInspectionAccessoryKey,
      amountGbp: Number(row.amount_gbp),
      resolution: row.resolution as string,
    }))
    .filter((row) => row.key);

  const returnChargesDraftSavedAt =
    authorized.hire.endHireDraft?.returnChargesDraftSavedAt?.trim() || null;
  const returnChargesAppliedAt =
    authorized.hire.endHireDraft?.returnChargesAppliedAt?.trim() || null;

  if (!returnChargesAppliedAt && savedDraft) {
    if (
      savedDraft.fuel.enabled &&
      savedDraft.fuel.chargeResolution === "add_to_balance" &&
      savedDraft.fuel.amountGbp != null &&
      savedDraft.fuel.amountGbp > 0
    ) {
      appliedFuelCharge = {
        amountGbp: savedDraft.fuel.amountGbp,
        resolution: "add_to_balance",
      };
    }
    appliedAccessoryCharges = savedDraft.accessories
      .filter(
        (accessory) =>
          accessory.enabled &&
          accessory.chargeResolution === "add_to_balance" &&
          accessory.amountGbp != null &&
          accessory.amountGbp > 0,
      )
      .map((accessory) => ({
        key: accessory.key as HireInspectionAccessoryKey,
        amountGbp: accessory.amountGbp as number,
        resolution: "add_to_balance",
      }));
  }

  const pendingReviews = authorized.hire.endHireDraft?.pendingReturnReviews ?? null;
  const fuelReviewLater = pendingReviews?.fuel === true && !appliedFuelCharge;
  const accessoryReviewsLater = (pendingReviews?.accessories ?? []).filter(
    (key): key is HireInspectionAccessoryKey =>
      missingAccessories.includes(key as HireInspectionAccessoryKey),
  ) as HireInspectionAccessoryKey[];
  const hasReturnChargeWork =
    newDamages.length > 0 || fuelShortfall || missingAccessories.length > 0;
  const returnChargesReady = areReturnChargesReady({
    newDamages: newDamages.map((damage) => ({
      id: damage.id,
      checkoutDamageId: null,
      chargeGbp: damage.chargeGbp,
      chargeResolution: damage.chargeResolution,
    })),
    returnChargesDraftSavedAt,
    returnChargesAppliedAt,
    hasReturnChargeWork,
  });

  return {
    ok: true,
    data: {
      checkinCompleted: Boolean(checkin?.checkinCompleted),
      checkinInspectionId: checkin?.id ?? null,
      checkoutFuelLevel,
      checkinFuelLevel,
      fuelShortfall,
      missingAccessories,
      newDamages,
      appliedFuelCharge,
      fuelReviewLater,
      appliedAccessoryCharges,
      accessoryReviewsLater,
      returnChargesDraftSavedAt,
      returnChargesAppliedAt,
      returnChargesReady,
    },
  };
}

function mergeReturnChargesDraftIntoDamages(
  damages: HireReturnChargesPageData["newDamages"],
  draft: HireEndHireReturnChargesDraft | null,
): HireReturnChargesPageData["newDamages"] {
  if (!draft) return damages;
  const draftById = new Map(draft.damages.map((damage) => [damage.id, damage]));
  return damages.map((damage) => {
    const saved = draftById.get(damage.id);
    if (!saved) return damage;
    const resolution = saved.chargeResolution;
    const chargeResolution: HireInspectionDamageChargeResolution | null =
      resolution === "waived" ||
      resolution === "add_to_balance" ||
      resolution === "review_later" ||
      resolution === "paid_now"
        ? resolution
        : null;
    return {
      ...damage,
      chargeGbp: saved.chargeGbp,
      chargeResolution,
    };
  });
}

export async function saveHireReturnChargesDraftAction(
  hireGroupId: string,
  input: {
    damages: HireReturnChargeDamageInput[];
    fuel: HireReturnChargeOptionalInput;
    accessories: HireReturnChargeAccessoryInput[];
  },
): Promise<ActionResult<{ returnChargesDraftSavedAt: string }>> {
  const authorized = await authorizeReturnChargesWrite(hireGroupId);
  if (!authorized.ok) return authorized;

  if (isHireEndHireFinalized({ status: authorized.hire.status, draft: authorized.hire.endHireDraft })) {
    return { ok: false, error: "Contract termination is already finalised." };
  }
  if (authorized.hire.status !== "terminated" && authorized.hire.status !== "completed") {
    return { ok: false, error: "Return charges can only be saved after the contract has ended." };
  }

  const damageError = validateReturnDamageCharges(input.damages);
  if (damageError) return { ok: false, error: damageError };

  const fuelError = validateOptionalReturnCharge(input.fuel);
  if (fuelError) return { ok: false, error: fuelError };

  for (const accessory of input.accessories) {
    const accessoryError = validateOptionalReturnCharge(accessory);
    if (accessoryError) {
      return { ok: false, error: `${accessoryError} (${accessory.key})` };
    }
  }

  const checkinRes = await loadHireInspectionAction(hireGroupId, "checkin");
  if (!checkinRes.ok || !checkinRes.data?.id || checkinRes.data.status !== "completed") {
    return { ok: false, error: "Complete vehicle check-in before saving return charges." };
  }

  const checkinDamageIds = new Set(checkinRes.data.damages.map((damage) => damage.id));
  for (const damage of input.damages) {
    if (!checkinDamageIds.has(damage.id)) {
      return { ok: false, error: "One or more damage charges do not belong to this check-in." };
    }
  }

  const nowIso = new Date().toISOString();
  const pendingAccessories = input.accessories
    .filter((accessory) => accessory.enabled && accessory.chargeResolution === "review_later")
    .map((accessory) => accessory.key);

  const returnChargesDraft: HireEndHireReturnChargesDraft = {
    damages: input.damages.map((damage) => ({
      id: damage.id,
      checkoutDamageId: damage.checkoutDamageId,
      chargeGbp: damage.chargeGbp,
      chargeResolution: damage.chargeResolution,
    })),
    fuel: {
      enabled: input.fuel.enabled,
      amountGbp: input.fuel.amountGbp,
      chargeResolution: input.fuel.chargeResolution,
    },
    accessories: input.accessories.map((accessory) => ({
      key: accessory.key,
      enabled: accessory.enabled,
      amountGbp: accessory.amountGbp,
      chargeResolution: accessory.chargeResolution,
    })),
  };

  const previousDraft =
    authorized.hire.endHireDraft ??
    ({
      started: true,
      step: "return_charges",
      returnDateYmd: "",
      returnTimeHm: "",
      reason: "",
      notes: "",
      rentBillingMode: "end_of_period",
      updatedAt: nowIso,
      finalizedAt: null,
      explicitFinalization: false,
      returnChargesDraft: null,
      returnChargesDraftSavedAt: null,
      returnChargesAppliedAt: null,
      pendingReturnReviews: null,
    } satisfies HireEndHireDraft);

  const nextDraft: HireEndHireDraft = {
    ...previousDraft,
    returnChargesDraft,
    returnChargesDraftSavedAt: nowIso,
    pendingReturnReviews: {
      fuel: Boolean(input.fuel.enabled && input.fuel.chargeResolution === "review_later"),
      accessories: pendingAccessories,
    },
    updatedAt: nowIso,
  };

  const admin = createSupabaseAdminClient();
  const { error: draftError } = await admin
    .from("vehicle_hire_groups")
    .update({ end_hire_draft: nextDraft })
    .eq("id", hireGroupId)
    .eq("parent_company_id", authorized.hire.parentCompanyId);
  if (draftError) return { ok: false, error: draftError.message };

  revalidateReturnChargePaths(hireGroupId, authorized.hire.vehicleId);
  return { ok: true, data: { returnChargesDraftSavedAt: nowIso } };
}

export async function commitHireReturnChargesFromDraftAction(
  hireGroupId: string,
): Promise<ActionResult<{ returnChargesAppliedAt: string }>> {
  const authorized = await authorizeReturnChargesWrite(hireGroupId);
  if (!authorized.ok) return authorized;

  const draft = authorized.hire.endHireDraft?.returnChargesDraft;
  if (!draft) {
    return { ok: true, data: { returnChargesAppliedAt: authorized.hire.endHireDraft?.returnChargesAppliedAt ?? new Date().toISOString() } };
  }
  if (authorized.hire.endHireDraft?.returnChargesAppliedAt?.trim()) {
    return {
      ok: true,
      data: { returnChargesAppliedAt: authorized.hire.endHireDraft.returnChargesAppliedAt },
    };
  }

  return applyHireReturnChargesAction(hireGroupId, {
    damages: draft.damages.map((damage) => ({
      id: damage.id,
      checkoutDamageId: damage.checkoutDamageId,
      chargeGbp: damage.chargeGbp,
      chargeResolution: damage.chargeResolution as HireInspectionDamageChargeResolution | null,
    })),
    fuel: {
      enabled: draft.fuel.enabled,
      amountGbp: draft.fuel.amountGbp,
      chargeResolution: draft.fuel.chargeResolution as HireInspectionDamageChargeResolution | null,
    },
    accessories: draft.accessories.map((accessory) => ({
      key: accessory.key as HireInspectionAccessoryKey,
      enabled: accessory.enabled,
      amountGbp: accessory.amountGbp,
      chargeResolution: accessory.chargeResolution as HireInspectionDamageChargeResolution | null,
    })),
  });
}

export async function applyHireReturnChargesAction(
  hireGroupId: string,
  input: {
    damages: HireReturnChargeDamageInput[];
    fuel: HireReturnChargeOptionalInput;
    accessories: HireReturnChargeAccessoryInput[];
  },
): Promise<ActionResult<{ returnChargesAppliedAt: string }>> {
  const authorized = await authorizeReturnChargesWrite(hireGroupId);
  if (!authorized.ok) return authorized;

  if (isHireEndHireFinalized({ status: authorized.hire.status, draft: authorized.hire.endHireDraft })) {
    return { ok: false, error: "Contract termination is already finalised." };
  }
  if (authorized.hire.status !== "terminated" && authorized.hire.status !== "completed") {
    return { ok: false, error: "Return charges can only be applied after the contract has ended." };
  }

  const damageError = validateReturnDamageCharges(input.damages);
  if (damageError) return { ok: false, error: damageError };

  const fuelError = validateOptionalReturnCharge(input.fuel);
  if (fuelError) return { ok: false, error: fuelError };

  for (const accessory of input.accessories) {
    const accessoryError = validateOptionalReturnCharge(accessory);
    if (accessoryError) {
      return { ok: false, error: `${accessoryError} (${accessory.key})` };
    }
  }

  const [checkoutRes, checkinRes] = await Promise.all([
    loadHireInspectionAction(hireGroupId, "checkout"),
    loadHireInspectionAction(hireGroupId, "checkin"),
  ]);
  if (!checkinRes.ok || !checkinRes.data?.id || checkinRes.data.status !== "completed") {
    return { ok: false, error: "Complete vehicle check-in before applying return charges." };
  }

  const checkout = checkoutRes.ok ? checkoutRes.data : null;
  const checkin = checkinRes.data;
  const checkinDamageIds = new Set(checkin.damages.map((damage) => damage.id));
  for (const damage of input.damages) {
    if (!checkinDamageIds.has(damage.id)) {
      return { ok: false, error: "One or more damage charges do not belong to this check-in." };
    }
  }

  const chargeDrafts = buildReturnChargeLineItemDrafts({
    damages: input.damages.map((damage) => {
      const source = checkin.damages.find((row) => row.id === damage.id);
      return {
        ...damage,
        panelId: source?.panelId ?? "",
        panelLabel: source?.panelLabel,
        damageType: source?.damageType ?? "",
        severity: source?.severity ?? "",
      };
    }),
    fuel: input.fuel.enabled
      ? {
          enabled: true,
          amountGbp: input.fuel.amountGbp,
          chargeResolution: input.fuel.chargeResolution,
          checkoutFuelLevel: checkout?.fuelLevel ?? null,
          checkinFuelLevel: checkin.fuelLevel,
          checkinInspectionId: checkin.id,
        }
      : undefined,
    accessories: input.accessories,
  });

  const addToBalanceGbp = sumLineItemAddToBalanceGbp(chargeDrafts);

  const admin = createSupabaseAdminClient();
  const userId = authorized.userId;
  const nowIso = new Date().toISOString();

  const { data: hireGroup, error: hireGroupError } = await admin
    .from("vehicle_hire_groups")
    .select(
      "settlement_balance_gbp, settlement_balance_direction, parent_company_id, end_hire_draft, vehicle_id",
    )
    .eq("id", hireGroupId)
    .eq("parent_company_id", authorized.hire.parentCompanyId)
    .maybeSingle();
  if (hireGroupError) return { ok: false, error: hireGroupError.message };
  if (!hireGroup) return { ok: false, error: "Hire not found." };

  const { data: existingCharges } = await admin
    .from("vehicle_hire_driver_charge_line_items")
    .select("id, balance_payment_id, resolution, amount_gbp")
    .eq("hire_group_id", hireGroupId)
    .in("source_kind", [...HIRE_RETURN_CHARGE_SOURCE_KINDS]);

  const previousAddToBalanceGbp = (existingCharges ?? []).reduce((sum, row) => {
    if (row.resolution !== "add_to_balance") return sum;
    const amount = Number(row.amount_gbp);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    return sum + amount;
  }, 0);

  const paymentIds = [
    ...new Set(
      (existingCharges ?? [])
        .map((row) => (row.balance_payment_id as string | null)?.trim() || "")
        .filter(Boolean),
    ),
  ];

  const { error: deleteChargesError } = await admin
    .from("vehicle_hire_driver_charge_line_items")
    .delete()
    .eq("hire_group_id", hireGroupId)
    .in("source_kind", [...HIRE_RETURN_CHARGE_SOURCE_KINDS]);
  if (deleteChargesError) return { ok: false, error: deleteChargesError.message };

  if (paymentIds.length > 0) {
    const { error: paymentDeleteError } = await admin
      .from("vehicle_hire_balance_payments")
      .delete()
      .eq("hire_group_id", hireGroupId)
      .in("id", paymentIds);
    if (paymentDeleteError) return { ok: false, error: paymentDeleteError.message };
  }

  await admin
    .from("vehicle_hire_balance_payments")
    .delete()
    .eq("hire_group_id", hireGroupId)
    .eq("payment_category", "driver_charge")
    .ilike("notes", "%return charge%");

  let balanceDirection = (hireGroup.settlement_balance_direction as
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null) ?? "settled";
  let balanceAmountGbp = Number(hireGroup.settlement_balance_gbp ?? 0);

  const reversedBalance = applySignedChargeDeltaToSettlementBalance({
    settlementBalanceDirection: balanceDirection,
    settlementBalanceGbp: balanceAmountGbp,
    deltaGbp: -previousAddToBalanceGbp,
  });
  balanceDirection = reversedBalance.settlementBalanceDirection;
  balanceAmountGbp = reversedBalance.settlementBalanceGbp;

  if (addToBalanceGbp > 0) {
    const balanceAfterCharges = applyDamageChargesToSettlementBalance({
      settlementBalanceDirection: balanceDirection,
      settlementBalanceGbp: balanceAmountGbp,
      addToBalanceGbp,
    });
    balanceDirection = balanceAfterCharges.settlementBalanceDirection;
    balanceAmountGbp = balanceAfterCharges.settlementBalanceGbp;
  }

  const { error: balanceUpdateError } = await admin
    .from("vehicle_hire_groups")
    .update({
      settlement_balance_direction: balanceDirection,
      settlement_balance_gbp: balanceAmountGbp,
    })
    .eq("id", hireGroupId)
    .eq("parent_company_id", authorized.hire.parentCompanyId);
  if (balanceUpdateError) return { ok: false, error: balanceUpdateError.message };

  for (const damage of input.damages) {
    if (damage.checkoutDamageId != null) continue;
    const chargeGbp =
      damage.chargeResolution === "waived" || damage.chargeResolution === "review_later"
        ? null
        : parseDamageChargeGbp(damage.chargeGbp);
    const chargeResolution =
      damage.chargeResolution && isValidDamageChargeResolution(damage.chargeResolution)
        ? damage.chargeResolution === "paid_now"
          ? "add_to_balance"
          : damage.chargeResolution
        : null;
    const { error: damageUpdateError } = await admin
      .from("vehicle_hire_inspection_damages")
      .update({
        charge_gbp: chargeGbp,
        charge_resolution: chargeResolution,
      })
      .eq("id", damage.id)
      .eq("inspection_id", checkin.id);
    if (damageUpdateError) return { ok: false, error: damageUpdateError.message };
  }

  if (chargeDrafts.length > 0) {
    const { error: lineItemsError } = await admin.from("vehicle_hire_driver_charge_line_items").insert(
      chargeDrafts.map((draft) => ({
        hire_group_id: hireGroupId,
        parent_company_id: hireGroup.parent_company_id as string,
        charge_type: draft.chargeType,
        amount_gbp: draft.amountGbp,
        resolution: draft.resolution,
        source_kind: draft.sourceKind,
        source_id: draft.sourceId ?? null,
        description: draft.description ?? null,
        balance_payment_id: null,
        charged_on: ukTodayYmd(),
        created_by_user_id: userId,
      })),
    );
    if (lineItemsError) return { ok: false, error: lineItemsError.message };
  }

  const previousDraft =
    parseHireEndHireDraft(hireGroup.end_hire_draft) ??
    ({
      started: true,
      step: "final_account",
      returnDateYmd: "",
      returnTimeHm: "",
      reason: "",
      notes: "",
      rentBillingMode: "end_of_period",
      updatedAt: nowIso,
      finalizedAt: null,
      explicitFinalization: false,
      returnChargesAppliedAt: null,
      pendingReturnReviews: null,
    } satisfies HireEndHireDraft);

  const pendingAccessories = input.accessories
    .filter(
      (accessory) => accessory.enabled && accessory.chargeResolution === "review_later",
    )
    .map((accessory) => accessory.key);

  const nextDraft: HireEndHireDraft = {
    ...previousDraft,
    returnChargesAppliedAt: nowIso,
    pendingReturnReviews: {
      fuel: Boolean(input.fuel.enabled && input.fuel.chargeResolution === "review_later"),
      accessories: pendingAccessories,
    },
    updatedAt: nowIso,
  };

  const { error: draftError } = await admin
    .from("vehicle_hire_groups")
    .update({ end_hire_draft: nextDraft })
    .eq("id", hireGroupId)
    .eq("parent_company_id", authorized.hire.parentCompanyId);
  if (draftError) return { ok: false, error: draftError.message };

  const totalChargedGbp = chargeDrafts.reduce((sum, draft) => sum + draft.amountGbp, 0);
  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "hire_status_changed",
    summary:
      totalChargedGbp > 0
        ? `Return charges applied at final account (£${totalChargedGbp.toFixed(2)}).`
        : "Return charges reviewed — no charges applied.",
    actorRole: "company_staff",
    actorUserId: userId,
  });

  revalidateReturnChargePaths(hireGroupId, (hireGroup.vehicle_id as string | null) ?? null);
  return { ok: true, data: { returnChargesAppliedAt: nowIso } };
}
