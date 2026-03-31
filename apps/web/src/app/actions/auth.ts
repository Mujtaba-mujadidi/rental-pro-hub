"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveAppHomePath } from "@/lib/auth/driver-redirect";
import {
  MIN_DRIVER_AGE_YEARS,
  normalizeUkPostcode,
  parseUkDate,
  validateDriverAge,
} from "@/lib/validation/driver-signup";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionResult = { error?: string };

export async function signInAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const signedInUser = data.user;
  if (!signedInUser?.id) {
    return { error: "Sign-in did not return a user." };
  }

  revalidatePath("/", "layout");

  const next = String(formData.get("next") ?? "").trim();
  if (next.startsWith("/") && !next.startsWith("//")) {
    redirect(next);
  }

  const home = await resolveAppHomePath(supabase, signedInUser.id, signedInUser.email);
  redirect(home);
}

function req(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Multi-step driver registration: personal + contact + address; password on final step. */
export async function signUpDriverAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const firstName = req(formData, "first_name");
  const lastName = req(formData, "last_name");
  const dateOfBirth = req(formData, "date_of_birth");
  const email = req(formData, "email");
  const phone = req(formData, "phone");
  const line1 = req(formData, "address_line1");
  const line2 = req(formData, "address_line2");
  const town = req(formData, "address_town");
  const county = req(formData, "address_county");
  const postcodeRaw = req(formData, "address_postcode");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!firstName || !lastName) {
    return { error: "First names and last name are required." };
  }
  if (!dateOfBirth) {
    return { error: "Date of birth is required." };
  }
  const dob = parseUkDate(dateOfBirth);
  if (!dob || !validateDriverAge(dob)) {
    return { error: `You must be at least ${MIN_DRIVER_AGE_YEARS} years old to register.` };
  }
  if (!email) {
    return { error: "Email is required." };
  }
  if (!phone) {
    return { error: "Contact phone number is required." };
  }
  if (!line1 || !town || !postcodeRaw) {
    return { error: "Address line 1, town, and postcode are required." };
  }
  const postcode = normalizeUkPostcode(postcodeRaw);
  if (!postcode) {
    return { error: "Enter a valid UK postcode (e.g. SW1A 1AA)." };
  }
  if (!password || !confirm) {
    return { error: "Password and confirmation are required." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const fullName = `${firstName} ${lastName}`.trim();

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        signup_flow: "driver",
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dateOfBirth,
        phone,
        address_line1: line1,
        address_line2: line2 || undefined,
        address_town: town,
        address_county: county || undefined,
        address_postcode: postcode.replace(/\s/g, "").toUpperCase(),
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/login?registered=1");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
