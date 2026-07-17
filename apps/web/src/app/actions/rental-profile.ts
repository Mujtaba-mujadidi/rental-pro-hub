"use server";

import { revalidatePath } from "next/cache";
import { revalidateProfileBundle } from "@/lib/auth/profile-bundle-cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { createClient } from "@/lib/supabase/server";

export type RentalProfileActionResult = { ok: true } | { ok: false; error: string };

export async function updateRentalDisplayNameAction(displayName: string): Promise<RentalProfileActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return { ok: false, error: frozen.error };
  const trimmed = displayName.trim();
  if (trimmed.length < 2) return { ok: false, error: "Enter at least 2 characters." };
  if (trimmed.length > 120) return { ok: false, error: "Name is too long." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", profile.id);
  if (error) return { ok: false, error: error.message };

  revalidateProfileBundle(profile.id);
  revalidatePath("/rental");
  revalidatePath("/rental/staff");
  revalidatePath("/rental/subcompany");
  return { ok: true };
}
