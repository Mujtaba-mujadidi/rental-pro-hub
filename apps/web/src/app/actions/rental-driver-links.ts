"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type LinkedDriverOption = {
  userId: string;
  label: string;
  email: string | null;
  phone: string | null;
};

export type DriverAccessRequestRow = {
  id: string;
  driver_user_id: string;
  subcompany_id: string;
  status: string;
  created_at: string;
  driver_label: string;
  driver_email: string | null;
};

function driverLabel(row: {
  first_name: string | null;
  last_name: string | null;
  account_email: string | null;
}): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || row.account_email || "Driver";
}

export async function loadDriverLabelsMap(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return new Map();

  let admin: Admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return new Map();
  }

  const { data } = await admin
    .from("driver_profiles")
    .select("user_id, first_name, last_name, account_email")
    .in("user_id", ids);

  const map = new Map<string, string>();
  for (const d of data ?? []) {
    map.set(d.user_id as string, driverLabel(d));
  }
  for (const id of ids) {
    if (!map.has(id)) map.set(id, "Driver");
  }
  return map;
}

export async function searchLinkedDriversAction(
  query: string,
): Promise<{ ok: true; rows: LinkedDriverOption[] } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission to view drivers." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  let admin: Admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: links, error: lErr } = await admin
    .from("company_driver_links")
    .select("driver_user_id")
    .eq("parent_company_id", companyId)
    .eq("status", "active");
  if (lErr) return { ok: false, error: lErr.message };

  const driverIds = (links ?? []).map((l) => l.driver_user_id as string);
  if (!driverIds.length) return { ok: true, rows: [] };

  let q = admin
    .from("driver_profiles")
    .select("user_id, first_name, last_name, account_email, phone")
    .in("user_id", driverIds)
    .order("last_name", { ascending: true })
    .limit(25);

  const term = query.trim();
  if (term.length >= 2) {
    const pat = `%${term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    q = q.or(
      `first_name.ilike.${pat},last_name.ilike.${pat},account_email.ilike.${pat},phone.ilike.${pat}`,
    );
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    rows: (data ?? []).map((d) => ({
      userId: d.user_id as string,
      label: driverLabel(d),
      email: (d.account_email as string | null) ?? null,
      phone: (d.phone as string | null) ?? null,
    })),
  };
}

export async function listDriverAccessRequestsAction(): Promise<
  { ok: true; rows: DriverAccessRequestRow[]; canManage: boolean } | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  let admin: Admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: requests, error } = await admin
    .from("company_driver_access_requests")
    .select("id, driver_user_id, subcompany_id, status, created_at")
    .eq("parent_company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };

  const driverIds = (requests ?? []).map((r) => r.driver_user_id as string);
  const labels = await loadDriverLabelsMap(driverIds);
  const { data: profiles } = driverIds.length
    ? await admin.from("driver_profiles").select("user_id, account_email").in("user_id", driverIds)
    : { data: [] };

  const emailByUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p.account_email as string | null]));

  return {
    ok: true,
    canManage: canWriteRentals(profile),
    rows: (requests ?? []).map((r) => ({
      id: r.id as string,
      driver_user_id: r.driver_user_id as string,
      subcompany_id: r.subcompany_id as string,
      status: r.status as string,
      created_at: r.created_at as string,
      driver_label: labels.get(r.driver_user_id as string) ?? "Driver",
      driver_email: emailByUser.get(r.driver_user_id as string) ?? null,
    })),
  };
}

export async function resolveDriverAccessRequestAction(input: {
  requestId: string;
  approve: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  let admin: Admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: req, error: rErr } = await admin
    .from("company_driver_access_requests")
    .select("id, parent_company_id, driver_user_id, status")
    .eq("id", input.requestId)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!req || req.parent_company_id !== profile.company_id) return { ok: false, error: "Request not found." };
  if (req.status !== "pending") return { ok: false, error: "Request is no longer pending." };

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("company_driver_access_requests")
    .update({
      status: input.approve ? "approved" : "rejected",
      resolved_at: now,
      resolved_by_user_id: user.id,
    })
    .eq("id", input.requestId);
  if (upErr) return { ok: false, error: upErr.message };

  if (input.approve) {
    const { error: linkErr } = await admin.from("company_driver_links").upsert(
      {
        parent_company_id: req.parent_company_id,
        driver_user_id: req.driver_user_id,
        status: "active",
        linked_at: now,
        linked_by_user_id: user.id,
      },
      { onConflict: "parent_company_id,driver_user_id" },
    );
    if (linkErr) return { ok: false, error: linkErr.message };
  }

  revalidatePath("/rental/hires");
  revalidatePath("/rental/settings");
  return { ok: true };
}

export async function assertDriverLinkedToCompany(
  admin: Admin,
  companyId: string,
  driverUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await admin
    .from("company_driver_links")
    .select("id")
    .eq("parent_company_id", companyId)
    .eq("driver_user_id", driverUserId)
    .eq("status", "active")
    .maybeSingle();
  if (!data?.id) {
    return { ok: false, error: "Driver must be linked to your company before creating a hire." };
  }
  return { ok: true };
}
