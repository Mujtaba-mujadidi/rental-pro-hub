"use server";

import { createClient } from "@/lib/supabase/server";
import { requireDriverArea } from "@/lib/auth/profile";
import { normalizeUkPostcode } from "@/lib/validation/driver-signup";
import { revalidatePath } from "next/cache";

export type DriverAddressActionResult = { error?: string; ok?: boolean };

function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function addrKey(line1: string, line2: string, town: string, county: string, postcode: string) {
  return [
    norm(line1).toLowerCase(),
    norm(line2).toLowerCase(),
    norm(town).toLowerCase(),
    norm(county).toLowerCase(),
    postcode.replace(/\s/g, "").toUpperCase(),
  ].join("|");
}

export async function updateDriverAddressAction(
  _prev: DriverAddressActionResult,
  formData: FormData,
): Promise<DriverAddressActionResult> {
  await requireDriverArea();

  const line1 = String(formData.get("address_line1") ?? "").trim();
  const line2 = String(formData.get("address_line2") ?? "").trim();
  const town = String(formData.get("address_town") ?? "").trim();
  const county = String(formData.get("address_county") ?? "").trim();
  const postcodeRaw = String(formData.get("address_postcode") ?? "").trim();

  if (!line1 || !town || !postcodeRaw) {
    return { error: "Address line 1, town, and postcode are required." };
  }
  const postcode = normalizeUkPostcode(postcodeRaw);
  if (!postcode) {
    return { error: "Enter a valid UK postcode (e.g. SW1A 1AA)." };
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
      "address_line1, address_line2, address_town, address_county, address_postcode",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return { error: fetchErr.message };
  }
  if (!existing) {
    return { error: "No driver profile found." };
  }

  const before = addrKey(
    existing.address_line1 ?? "",
    existing.address_line2 ?? "",
    existing.address_town ?? "",
    existing.address_county ?? "",
    existing.address_postcode ?? "",
  );
  const after = addrKey(line1, line2, town, county, postcode);
  const addressChanged = before !== after;

  const now = new Date().toISOString();
  if (!addressChanged) {
    // If they re-save the same active address, clear any pending request.
    const { error: clearErr } = await supabase
      .from("driver_profiles")
      .update({
        pending_address_line1: null,
        pending_address_line2: null,
        pending_address_town: null,
        pending_address_county: null,
        pending_address_postcode: null,
        pending_address_submitted_at: null,
        licence_revalidation_due_at: null,
        driving_address_confirmed_at: null,
        updated_at: now,
      })
      .eq("user_id", user.id);
    if (clearErr) return { error: clearErr.message };
    revalidatePath("/driver", "layout");
    revalidatePath("/driver/onboarding", "layout");
    return { ok: true };
  }
  // Archive prior address then promote new address immediately.
  const { error: histErr } = await supabase.from("driver_address_history").insert({
    user_id: user.id,
    address_line1: existing.address_line1,
    address_line2: existing.address_line2,
    address_town: existing.address_town,
    address_county: existing.address_county,
    address_postcode: existing.address_postcode,
    effective_from: now,
    effective_to: now,
  });
  if (histErr) return { error: histErr.message };

  const { error: upErr } = await supabase
    .from("driver_profiles")
    .update({
      // Save new address as pending until driving licence images are updated.
      pending_address_line1: line1,
      pending_address_line2: line2 || null,
      pending_address_town: town,
      pending_address_county: county || null,
      pending_address_postcode: postcode,
      pending_address_submitted_at: now,
      // Banner/reminder stays visible until the driver uploads new driving licence images.
      licence_revalidation_due_at: now,
      driving_address_confirmed_at: null,
      updated_at: now,
    })
    .eq("user_id", user.id);

  if (upErr) {
    return { error: upErr.message };
  }

  revalidatePath("/driver", "layout");
  revalidatePath("/driver/onboarding", "layout");
  return { ok: true };
}
