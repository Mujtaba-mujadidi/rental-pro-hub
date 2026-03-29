import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdmin, isSuperAdminEmail } from "@/lib/auth/roles";

export type AppProfile = {
  id: string;
  role: "driver" | "super_admin";
  display_name: string | null;
};

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

/** Insert a missing profiles row (RLS: own id only). Super admin role if SUPER_ADMIN_EMAIL matches. */
async function ensureProfileRow(user: User): Promise<boolean> {
  const supabase = await createClient();
  const { data: existing, error: exErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (exErr) {
    console.error("profiles check failed", exErr.message);
    return false;
  }
  if (existing) return true;

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.first_name === "string" && typeof meta?.last_name === "string"
        ? `${meta.first_name} ${meta.last_name}`.trim()
        : null;
  const displayName = fromMeta?.trim() || user.email?.split("@")[0] || "User";
  const role = isSuperAdminEmail(user.email) ? "super_admin" : "driver";

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    display_name: displayName,
    role,
  });

  if (error) {
    console.error("profiles insert failed", error.message);
    return false;
  }
  return true;
}

export async function getAppProfile(): Promise<AppProfile | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("profiles load failed", error.message);
    return null;
  }

  if (!data) {
    const created = await ensureProfileRow(user);
    if (!created) return null;
    const { data: again, error: err2 } = await supabase
      .from("profiles")
      .select("id, role, display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (err2 || !again) return null;
    return {
      id: again.id,
      role: again.role === "super_admin" ? "super_admin" : "driver",
      display_name: again.display_name,
    };
  }

  return {
    id: data.id,
    role: data.role === "super_admin" ? "super_admin" : "driver",
    display_name: data.display_name,
  };
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAuthProfile() {
  const user = await requireAuth();
  const profile = await getAppProfile();
  if (!profile) redirect("/login");
  return { user, profile };
}

export async function requireSuperAdmin() {
  const { user, profile } = await requireAuthProfile();
  if (!isSuperAdmin(user.email, profile)) {
    redirect("/driver");
  }
  return { user, profile };
}

export async function requireDriverArea() {
  const { user, profile } = await requireAuthProfile();
  if (isSuperAdmin(user.email, profile)) {
    redirect("/super-admin");
  }
  return { user, profile };
}
