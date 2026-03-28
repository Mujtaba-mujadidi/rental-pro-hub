import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UserProfile = {
  id: string;
  user_type: "platform_admin" | "company_staff" | "driver";
  display_name: string | null;
  phone: string | null;
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

export async function getUserProfile(): Promise<UserProfile | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profile")
    .select("id, user_type, display_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("user_profile load failed", error.message);
    return null;
  }

  return data as UserProfile | null;
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireProfile() {
  const user = await requireAuth();
  const profile = await getUserProfile();
  if (!profile) redirect("/login");
  return { user, profile };
}

export async function requirePlatformAdmin() {
  const { user, profile } = await requireProfile();
  if (profile.user_type !== "platform_admin") redirect("/dashboard");
  return { user, profile };
}
