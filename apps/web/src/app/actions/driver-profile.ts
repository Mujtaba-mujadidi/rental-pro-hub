"use server";

import { createClient } from "@/lib/supabase/server";
import { requireDriverArea } from "@/lib/auth/profile";
import { revalidatePath } from "next/cache";

export type DriverProfileActionResult = { error?: string; ok?: boolean };

export async function updateDriverPhoneAction(
  _prev: DriverProfileActionResult,
  formData: FormData,
): Promise<DriverProfileActionResult> {
  await requireDriverArea();

  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) {
    return { error: "Phone number is required." };
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) {
    return { error: "Enter a valid phone number (at least 10 digits)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("driver_profiles")
    .update({ phone, updated_at: now })
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/driver/profile");
  revalidatePath("/driver", "layout");
  return { ok: true };
}

/**
 * Verifies the current password, then sets a new one (Supabase Auth).
 */
export async function changeDriverPasswordAction(
  _prev: DriverProfileActionResult,
  formData: FormData,
): Promise<DriverProfileActionResult> {
  await requireDriverArea();

  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All password fields are required." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New password and confirmation do not match." };
  }
  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (currentPassword === newPassword) {
    return { error: "New password must be different from your current password." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email;
  if (!email) {
    return { error: "No email on account." };
  }

  const { error: signErr } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signErr) {
    return { error: "Current password is incorrect." };
  }

  const { error: upErr } = await supabase.auth.updateUser({ password: newPassword });
  if (upErr) {
    return { error: upErr.message };
  }

  revalidatePath("/driver/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}
