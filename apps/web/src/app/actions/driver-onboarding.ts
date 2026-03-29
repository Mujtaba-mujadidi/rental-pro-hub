"use server";

import { createClient } from "@/lib/supabase/server";
import { requireDriverArea } from "@/lib/auth/profile";
import { driverLicenceReviewReasons } from "@/lib/driver/licence-attention";
import { DRIVER_ONBOARDING_COLUMNS, driverDrivingLicenceStepComplete } from "@/lib/driver/licence-check";
import {
  DRIVING_LICENCE_NUMBER_MAX_LEN,
  isExpiryOnOrAfterToday,
  normalizeUkDrivingLicenceNumber,
} from "@/lib/validation/driver-signup";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type LicenceActionResult = {
  error?: string;
  /** Set when driving step saved successfully (client advances to PHV step). */
  drivingStepSavedAt?: number;
};

export type ConfirmAddressLicenceResult = { error?: string };

function strNorm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function isoDay(s: string | null | undefined): string {
  if (!s) return "";
  return s.slice(0, 10);
}

const BUCKET = "driver-licences";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extForMime(mime: string): string | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

function getUploadedFile(formData: FormData, key: string): File | null {
  const v = formData.get(key);
  if (!v || typeof v === "string") return null;
  if (v.size === 0) return null;
  return v;
}

async function uploadSlot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  slot: "front" | "back" | "phv",
  file: File | null,
  existingPath: string | null,
): Promise<{ path: string | null; error?: string }> {
  if (!file) {
    return { path: existingPath };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { path: null, error: "Each image must be 5 MB or smaller." };
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return {
      path: null,
      error: "Licence photos must be JPEG, PNG, or WebP.",
    };
  }
  const ext = extForMime(file.type);
  if (!ext) {
    return { path: null, error: "Unsupported image type." };
  }
  const base =
    slot === "front"
      ? "driving-licence-front"
      : slot === "back"
        ? "driving-licence-back"
        : "phv-licence-card";
  const objectPath = `${userId}/${base}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buf, { contentType: file.type, upsert: true });
  if (error) {
    return { path: null, error: error.message };
  }
  return { path: objectPath };
}

export async function saveDriverOnboardingDrivingStep(
  _prev: LicenceActionResult,
  formData: FormData,
): Promise<LicenceActionResult> {
  await requireDriverArea();

  const dvlaRaw = String(formData.get("driving_licence_number") ?? "").trim();
  const dvlaExpiry = String(formData.get("driving_licence_expiry") ?? "").trim();

  if (!dvlaRaw || !dvlaExpiry) {
    return { error: "Driving licence number and expiry are required." };
  }
  const dvlaNumber = normalizeUkDrivingLicenceNumber(dvlaRaw);
  if (!dvlaNumber) {
    return { error: "Driving licence number is required." };
  }
  if (dvlaNumber.length > DRIVING_LICENCE_NUMBER_MAX_LEN) {
    return {
      error: `Driving licence number is too long (max ${DRIVING_LICENCE_NUMBER_MAX_LEN} characters, excluding spaces).`,
    };
  }
  if (!isExpiryOnOrAfterToday(dvlaExpiry)) {
    return { error: "Driving licence expiry must be today or in the future." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("driver_profiles")
    .select(
      "user_id, driving_licence_number, driving_licence_expiry, driving_licence_front_path, driving_licence_back_path, licence_revalidation_due_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return { error: fetchErr.message };
  }
  if (!existing) {
    return {
      error:
        "No driver profile found. Finish driver sign-up first, or contact support if this persists.",
    };
  }

  const fileFront = getUploadedFile(formData, "driving_licence_front");
  const fileBack = getUploadedFile(formData, "driving_licence_back");

  if (!fileFront && !existing.driving_licence_front_path) {
    return { error: "Upload a photo of the front of your driving licence." };
  }
  if (!fileBack && !existing.driving_licence_back_path) {
    return { error: "Upload a photo of the back of your driving licence." };
  }

  const upFront = await uploadSlot(
    supabase,
    user.id,
    "front",
    fileFront,
    existing.driving_licence_front_path,
  );
  if (upFront.error) return { error: upFront.error };

  const upBack = await uploadSlot(
    supabase,
    user.id,
    "back",
    fileBack,
    existing.driving_licence_back_path,
  );
  if (upBack.error) return { error: upBack.error };

  const frontPath = upFront.path ?? null;
  const backPath = upBack.path ?? null;

  if (!frontPath || !backPath) {
    return { error: "Front and back driving licence photos are required." };
  }

  const hadRevalidation = Boolean(existing.licence_revalidation_due_at);
  if (hadRevalidation) {
    const w = formData.get("confirm_wizard_driving_matches_address");
    if (w !== "on") {
      return {
        error:
          "Tick the box to confirm your driving licence number, expiry, and front/back photos match your current address before saving.",
      };
    }
  }

  const now = new Date().toISOString();
  const uploadedFront = Boolean(fileFront);
  const uploadedBack = Boolean(fileBack);
  const clearAddressRevalidation =
    hadRevalidation &&
    (uploadedFront ||
      uploadedBack ||
      strNorm(existing.driving_licence_number) !== strNorm(dvlaNumber) ||
      isoDay(existing.driving_licence_expiry) !== isoDay(dvlaExpiry));

  const drivingPatch: Record<string, unknown> = {
    driving_licence_number: dvlaNumber,
    driving_licence_expiry: dvlaExpiry,
    driving_licence_front_path: frontPath,
    driving_licence_back_path: backPath,
    updated_at: now,
  };
  if (clearAddressRevalidation) {
    drivingPatch.licence_revalidation_due_at = null;
  }

  const { error: upErr } = await supabase
    .from("driver_profiles")
    .update(drivingPatch)
    .eq("user_id", user.id);

  if (upErr) {
    return { error: upErr.message };
  }

  revalidatePath("/driver/onboarding");
  revalidatePath("/driver", "layout");
  return { drivingStepSavedAt: Date.now() };
}

export async function saveDriverOnboardingPhvStep(
  _prev: LicenceActionResult,
  formData: FormData,
): Promise<LicenceActionResult> {
  await requireDriverArea();

  const phvNumber = String(formData.get("phv_licence_number") ?? "").trim();
  const phvAuthority = String(formData.get("phv_licensing_authority") ?? "").trim();
  const phvExpiry = String(formData.get("phv_licence_expiry") ?? "").trim();

  if (!phvNumber || !phvAuthority || !phvExpiry) {
    return {
      error: "PHV / taxi licence number, licensing authority, and expiry are required.",
    };
  }
  if (!isExpiryOnOrAfterToday(phvExpiry)) {
    return { error: "PHV / taxi licence expiry must be today or in the future." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("driver_profiles")
    .select(
      "user_id, driving_licence_front_path, driving_licence_back_path, phv_licence_card_path, driving_licence_number, driving_licence_expiry, phv_licence_number, phv_licensing_authority, phv_licence_expiry, onboarding_completed_at, licence_revalidation_due_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return { error: fetchErr.message };
  }
  if (!existing) {
    return {
      error:
        "No driver profile found. Finish driver sign-up first, or contact support if this persists.",
    };
  }

  const rowForDrivingCheck = {
    driving_licence_number: existing.driving_licence_number,
    driving_licence_expiry: existing.driving_licence_expiry,
    driving_licence_front_path: existing.driving_licence_front_path,
    driving_licence_back_path: existing.driving_licence_back_path,
    phv_licence_number: null,
    phv_licensing_authority: null,
    phv_licence_expiry: null,
    phv_licence_card_path: null,
    licence_revalidation_due_at: null,
  };

  if (!driverDrivingLicenceStepComplete(rowForDrivingCheck)) {
    return { error: "Complete the driving licence step first." };
  }

  const filePhv = getUploadedFile(formData, "phv_licence_card");

  if (!filePhv && !existing.phv_licence_card_path) {
    return { error: "Upload a photo of your PHV / taxi licence." };
  }

  const upPhv = await uploadSlot(
    supabase,
    user.id,
    "phv",
    filePhv,
    existing.phv_licence_card_path,
  );
  if (upPhv.error) return { error: upPhv.error };

  const phvPath = upPhv.path ?? null;

  if (!phvPath) {
    return { error: "A PHV / taxi licence photo is required." };
  }

  const now = new Date().toISOString();
  const completedAt = existing.onboarding_completed_at ?? now;

  const hadRevalidation = Boolean(existing.licence_revalidation_due_at);
  if (hadRevalidation) {
    const p = formData.get("confirm_wizard_phv_matches_address");
    if (p !== "on") {
      return {
        error:
          "Tick the box to confirm your PHV / taxi licence matches your current address before saving.",
      };
    }
  }

  const clearAddressRevalidation = hadRevalidation;

  const phvPatch: Record<string, unknown> = {
    phv_licence_number: phvNumber,
    phv_licensing_authority: phvAuthority,
    phv_licence_expiry: phvExpiry,
    phv_licence_card_path: phvPath,
    onboarding_completed_at: completedAt,
    updated_at: now,
  };
  if (clearAddressRevalidation) {
    phvPatch.licence_revalidation_due_at = null;
  }

  const { error: upErr } = await supabase.from("driver_profiles").update(phvPatch).eq("user_id", user.id);

  if (upErr) {
    return { error: upErr.message };
  }

  revalidatePath("/driver", "layout");
  revalidatePath("/driver/onboarding", "layout");

  const redirectAfter = String(formData.get("redirect_after_phv") ?? "").trim();
  if (redirectAfter === "onboarding") {
    redirect("/driver/onboarding");
  }
  redirect("/driver");
}

/**
 * Two-step attestation after address change: driver confirms driving then PHV licences already match
 * the new address (no file changes). Only allowed when the sole review reason is address_changed.
 */
export async function confirmLicencesMatchAddressAction(
  _prev: ConfirmAddressLicenceResult,
  formData: FormData,
): Promise<ConfirmAddressLicenceResult> {
  await requireDriverArea();

  const step1 = String(formData.get("confirm_driving_attested") ?? "");
  const phvBox = formData.get("confirm_phv_matches_address");
  if (step1 !== "yes") {
    return { error: "Invalid form submission. Go back to step 1." };
  }
  if (phvBox !== "on") {
    return { error: "Tick the box to confirm your PHV / taxi licence matches your current address." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("driver_profiles")
    .select(DRIVER_ONBOARDING_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return { error: fetchErr.message };
  }
  if (!row?.licence_revalidation_due_at) {
    return { error: "No pending address confirmation is required." };
  }

  const reasons = driverLicenceReviewReasons(row);
  if (reasons.length === 0 || !reasons.every((r) => r.code === "address_changed")) {
    return {
      error:
        "This confirmation is only available when the only outstanding issue is your address change. Use Update licences to fix expiry or upload new documents.",
    };
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("driver_profiles")
    .update({ licence_revalidation_due_at: null, updated_at: now })
    .eq("user_id", user.id);

  if (upErr) {
    return { error: upErr.message };
  }

  revalidatePath("/driver", "layout");
  revalidatePath("/driver/onboarding", "layout");
  redirect("/driver");
}
