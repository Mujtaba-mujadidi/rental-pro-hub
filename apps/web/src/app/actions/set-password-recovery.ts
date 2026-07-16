"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAppHomePath } from "@/lib/auth/driver-redirect";

export type SetPasswordRecoveryResult = { error?: string; ok?: boolean };

export async function setPasswordAfterRecoveryAction(
  _prev: SetPasswordRecoveryResult,
  formData: FormData,
): Promise<SetPasswordRecoveryResult> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!password || !confirm) {
    return { error: "Enter and confirm your new password." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const cookieStore = await cookies();
  if (cookieStore.get("rph_pw_recovery")?.value !== "1") {
    return { error: "Use the password reset link from your email again — this session is not a password reset flow." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { error: "Your session expired. Open the reset link from your email again." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  cookieStore.delete("rph_pw_recovery");

  const home = await resolveAppHomePath(supabase, user.id, user.email);
  redirect(home);
}
