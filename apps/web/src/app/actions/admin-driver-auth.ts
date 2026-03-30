"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPublicSiteUrl } from "@/lib/supabase/site-url";

export type AdminDriverAuthResult = {
  error?: string;
  ok?: boolean;
  /** Send this URL to the driver securely (e.g. copy); valid for a short time. */
  passwordResetLink?: string;
};

const LONG_BAN = "876000h";

function assertServiceAdmin(): ReturnType<typeof createSupabaseAdminClient> {
  return createSupabaseAdminClient();
}

async function assertRegisteredDriver(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
): Promise<{ error?: string }> {
  const { data } = await admin.from("driver_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) return { error: "That user is not a registered driver." };
  return {};
}

export async function adminGenerateDriverPasswordResetLinkAction(userId: string): Promise<AdminDriverAuthResult> {
  const trimmed = userId?.trim();
  if (!trimmed) return { error: "Missing driver." };

  await requireSuperAdmin();

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = assertServiceAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error.";
    return { error: msg };
  }

  const reg = await assertRegisteredDriver(admin, trimmed);
  if (reg.error) return { error: reg.error };

  const { data: authRes, error: userErr } = await admin.auth.admin.getUserById(trimmed);
  if (userErr || !authRes.user?.email) {
    return { error: userErr?.message ?? "Could not load sign-in email for this driver." };
  }

  const callbackBase = `${getPublicSiteUrl()}/auth/callback`;
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: authRes.user.email,
    options: { redirectTo: callbackBase },
  });

  if (linkErr) {
    return { error: linkErr.message };
  }

  const props = linkData?.properties;
  if (!props) {
    return { error: "Could not create recovery link (empty response)." };
  }

  const hashed = props.hashed_token as string | undefined;
  if (hashed && typeof hashed === "string") {
    const qs = new URLSearchParams({
      token_hash: hashed,
      type: "recovery",
      next: "/auth/set-password",
    });
    return { ok: true, passwordResetLink: `${callbackBase}?${qs.toString()}` };
  }

  const actionLink = props.action_link as string | undefined;
  if (actionLink && typeof actionLink === "string") {
    return { ok: true, passwordResetLink: actionLink };
  }

  return { error: "Could not build recovery link (no hashed_token or action_link)." };
}

export async function adminSetDriverBlockedAction(
  userId: string,
  blocked: boolean,
): Promise<{ error?: string; ok?: boolean }> {
  const trimmed = userId?.trim();
  if (!trimmed) return { error: "Missing driver." };

  const { user } = await requireSuperAdmin();
  if (trimmed === user.id) {
    return { error: "You cannot block or unblock your own account." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = assertServiceAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error.";
    return { error: msg };
  }

  const reg = await assertRegisteredDriver(admin, trimmed);
  if (reg.error) return { error: reg.error };

  const { data: updatedAuth, error } = await admin.auth.admin.updateUserById(trimmed, {
    ban_duration: blocked ? LONG_BAN : "none",
  });

  if (error) {
    return { error: error.message };
  }

  const bannedUntil = updatedAuth.user?.banned_until ?? null;
  const { error: syncErr } = await admin
    .from("driver_profiles")
    .update({ account_banned_until: bannedUntil })
    .eq("user_id", trimmed);

  if (syncErr) {
    return { error: syncErr.message };
  }

  revalidatePath("/super-admin/drivers");
  return { ok: true };
}
