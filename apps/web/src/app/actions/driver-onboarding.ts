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
  // Versioned object paths so we can keep historical documents.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const objectPath = `${userId}/${base}/${stamp}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buf, { contentType: file.type });
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
      "user_id, address_line1, address_line2, address_town, address_county, address_postcode, address_verified_at, driving_licence_number, driving_licence_expiry, driving_licence_front_path, driving_licence_back_path, pending_address_line1, pending_address_line2, pending_address_town, pending_address_county, pending_address_postcode, pending_address_submitted_at, driving_address_confirmed_at, phv_address_confirmed_at, licence_revalidation_due_at",
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

  const now = new Date().toISOString();
  const uploadedFront = Boolean(fileFront);
  const uploadedBack = Boolean(fileBack);
  const hadRevalidation = Boolean(existing.licence_revalidation_due_at);
  const hasPendingAddress = Boolean(existing.pending_address_submitted_at);
  const clearAddressRevalidation =
    hadRevalidation &&
    (uploadedFront ||
      uploadedBack ||
      strNorm(existing.driving_licence_number) !== strNorm(dvlaNumber) ||
      isoDay(existing.driving_licence_expiry) !== isoDay(dvlaExpiry));

  const requireDrivingAddressAttestation = hasPendingAddress || hadRevalidation;
  if (requireDrivingAddressAttestation) {
    const w = formData.get("confirm_wizard_driving_matches_address");
    if (w !== "on") {
      return {
        error:
          "Tick the box to confirm your driving licence details and photos match the address on file before saving.",
      };
    }
  }

  const drivingPatch: Record<string, unknown> = {
    driving_licence_number: dvlaNumber,
    driving_licence_expiry: dvlaExpiry,
    driving_licence_front_path: frontPath,
    driving_licence_back_path: backPath,
    updated_at: now,
  };
  if (requireDrivingAddressAttestation) {
    drivingPatch.driving_address_confirmed_at = now;
  }
  // Auto-promote pending address to current once new driving licence images are saved.
  if (hasPendingAddress) {
    // Archive old active address (kept for historical rentals/PCNs).
    const { error: histErr } = await supabase.from("driver_address_history").insert({
      user_id: user.id,
      address_line1: existing.address_line1,
      address_line2: existing.address_line2 ?? null,
      address_town: existing.address_town,
      address_county: existing.address_county ?? null,
      address_postcode: existing.address_postcode,
      effective_from: existing.address_verified_at ?? now,
      effective_to: now,
    });
    if (histErr) return { error: histErr.message };

    drivingPatch.address_line1 = existing.pending_address_line1;
    drivingPatch.address_line2 = existing.pending_address_line2;
    drivingPatch.address_town = existing.pending_address_town;
    drivingPatch.address_county = existing.pending_address_county;
    drivingPatch.address_postcode = existing.pending_address_postcode;
    drivingPatch.address_verified_at = now;
    drivingPatch.pending_address_line1 = null;
    drivingPatch.pending_address_line2 = null;
    drivingPatch.pending_address_town = null;
    drivingPatch.pending_address_county = null;
    drivingPatch.pending_address_postcode = null;
    drivingPatch.pending_address_submitted_at = null;
    // Banner cleared once the new driving licence images are saved.
    drivingPatch.licence_revalidation_due_at = null;
    drivingPatch.phv_address_confirmed_at = null;
  } else if (clearAddressRevalidation) {
    drivingPatch.licence_revalidation_due_at = null;
  }

  // Archive licence document versions (keep old paths for disputes/PCNs).
  const versionRows: Array<Record<string, unknown>> = [];
  if (uploadedFront) {
    if (existing.driving_licence_front_path) {
      versionRows.push({
        user_id: user.id,
        slot: "driving_front",
        object_path: existing.driving_licence_front_path,
        uploaded_at: now,
        superseded_at: now,
      });
    }
    versionRows.push({
      user_id: user.id,
      slot: "driving_front",
      object_path: frontPath,
      uploaded_at: now,
      superseded_at: null,
    });
  }
  if (uploadedBack) {
    if (existing.driving_licence_back_path) {
      versionRows.push({
        user_id: user.id,
        slot: "driving_back",
        object_path: existing.driving_licence_back_path,
        uploaded_at: now,
        superseded_at: now,
      });
    }
    versionRows.push({
      user_id: user.id,
      slot: "driving_back",
      object_path: backPath,
      uploaded_at: now,
      superseded_at: null,
    });
  }
  if (versionRows.length > 0) {
    const { error: verErr } = await supabase.from("driver_licence_document_versions").insert(versionRows);
    if (verErr) return { error: verErr.message };
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
      "user_id, driving_licence_front_path, driving_licence_back_path, phv_licence_card_path, driving_licence_number, driving_licence_expiry, phv_licence_number, phv_licensing_authority, phv_licence_expiry, onboarding_completed_at, driving_address_confirmed_at, phv_address_confirmed_at, licence_revalidation_due_at, pending_address_submitted_at",
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
    driving_address_confirmed_at: null,
    phv_address_confirmed_at: null,
    pending_address_line1: null,
    pending_address_line2: null,
    pending_address_town: null,
    pending_address_county: null,
    pending_address_postcode: null,
    pending_address_submitted_at: null,
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
  const hasPendingAddress = Boolean(existing.pending_address_submitted_at);
  const drivingConfirmedAt = existing.driving_address_confirmed_at;
  const phvConfirmedAt = existing.phv_address_confirmed_at;
  const phvMustCatchUpDriving =
    Boolean(drivingConfirmedAt) &&
    (!phvConfirmedAt || String(phvConfirmedAt).localeCompare(String(drivingConfirmedAt)) < 0);
  const requirePhvAddressAttestation = hadRevalidation || hasPendingAddress || phvMustCatchUpDriving;
  if (requirePhvAddressAttestation) {
    const p = formData.get("confirm_wizard_phv_matches_address");
    if (p !== "on") {
      return {
        error:
          "Tick the box to confirm your PHV / taxi licence details and photo match the address on file before saving.",
      };
    }
  }

  const phvPatch: Record<string, unknown> = {
    phv_licence_number: phvNumber,
    phv_licensing_authority: phvAuthority,
    phv_licence_expiry: phvExpiry,
    phv_licence_card_path: phvPath,
    onboarding_completed_at: completedAt,
    updated_at: now,
  };
  if (requirePhvAddressAttestation) {
    phvPatch.phv_address_confirmed_at = now;
  }
  const drivingConfirmed = Boolean(existing.driving_address_confirmed_at);
  if (hadRevalidation && drivingConfirmed) {
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
  return { error: "This confirmation flow is currently disabled." };
}
