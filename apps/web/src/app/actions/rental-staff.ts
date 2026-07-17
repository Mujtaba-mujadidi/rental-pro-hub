"use server";

import { revalidatePath } from "next/cache";
import { createHash, randomBytes } from "crypto";
import type { CompanyMembershipRole } from "@/lib/auth/profile";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { revalidateProfileBundle } from "@/lib/auth/profile-bundle-cache";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPublicSiteUrl } from "@/lib/supabase/site-url";
import {
  ensureRentalCompanyMembership,
  findAuthUserIdByEmail,
} from "@/lib/auth/ensure-rental-membership";

export type StaffActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: "LAST_OWNER_CONFIRM" };

const INVITABLE_ROLES = new Set<CompanyMembershipRole>(["admin", "operations", "finance", "viewer"]);

function isRentalAdmin(profile: { membership_role: string | null }) {
  return profile.membership_role === "owner" || profile.membership_role === "admin";
}

export type InviteStaffAccess = { scope: "all" | "explicit"; subcompanyIds: string[] };

export async function inviteRentalStaffAction(
  email: string,
  proposedRole: CompanyMembershipRole,
  inviteeFirstName: string,
  inviteeLastName: string,
  access?: InviteStaffAccess,
): Promise<StaffActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return { ok: false, error: frozen.error };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!isRentalAdmin(profile)) {
    return { ok: false, error: "Only owners or admins can invite staff." };
  }
  if (proposedRole === "owner" || !INVITABLE_ROLES.has(proposedRole)) {
    return { ok: false, error: "Invalid role for staff invite." };
  }

  const em = email.trim().toLowerCase();
  if (!em || !em.includes("@")) return { ok: false, error: "Valid email required." };

  const first = inviteeFirstName.trim();
  const last = inviteeLastName.trim();
  if (first.length < 1) return { ok: false, error: "First name is required." };
  if (last.length < 1) return { ok: false, error: "Last name is required." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  let scopeMeta: "all" | "explicit" = "all";
  let explicitIds: string[] = [];
  if (proposedRole !== "admin") {
    const acc = access ?? { scope: "all" as const, subcompanyIds: [] };
    if (acc.scope === "explicit") {
      const ids = [...new Set(acc.subcompanyIds.map((x) => x.trim()).filter(Boolean))];
      if (ids.length === 0) {
        return { ok: false, error: "Choose at least one subcompany, or set access to all locations." };
      }
      const { data: subs, error: subErr } = await admin
        .from("subcompanies")
        .select("id")
        .eq("parent_company_id", companyId);
      if (subErr) return { ok: false, error: subErr.message };
      const allowed = new Set((subs ?? []).map((s) => s.id));
      const filtered = ids.filter((id) => allowed.has(id));
      if (filtered.length === 0) {
        return { ok: false, error: "Invalid subcompany selection for this company." };
      }
      scopeMeta = "explicit";
      explicitIds = filtered;
    }
  }

  const callbackBase = `${getPublicSiteUrl()}/auth/callback`;

  const { data: invData, error: invErr } = await admin.auth.admin.inviteUserByEmail(em, {
    redirectTo: callbackBase,
    data: {
      app_role: "rental_company",
      company_role: "staff",
      company_id: companyId,
      rental_membership_role: proposedRole,
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`.trim(),
      rental_subcompany_scope: scopeMeta,
      rental_subcompany_ids: JSON.stringify(explicitIds),
    },
  });

  if (invErr) {
    const m = invErr.message;
    if (/already registered|already been registered|user already exists/i.test(m)) {
      return {
        ok: false,
        error:
          "This email already has an account. Ask them to sign in, or remove them from another tenant before inviting.",
      };
    }
    return { ok: false, error: m };
  }

  const uid = invData.user?.id ?? (await findAuthUserIdByEmail(admin, em));
  if (!uid) {
    return {
      ok: false,
      error: "Invite may have been emailed, but the staff account could not be linked. Try again.",
    };
  }

  const ensured = await ensureRentalCompanyMembership(admin, {
    userId: uid,
    companyId,
    membershipRole: proposedRole,
    companyRole: proposedRole === "admin" ? "admin" : "staff",
    firstName: first,
    lastName: last,
    displayName: `${first} ${last}`.trim(),
    subcompanyScope: scopeMeta,
    subcompanyIds: explicitIds,
  });
  if (!ensured.ok) return ensured;

  const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const expiresAt = new Date(Date.now() + 14 * 864e5).toISOString();

  const { error: insErr } = await admin.from("staff_invitations").insert({
    parent_company_id: companyId,
    email: em,
    token_hash: tokenHash,
    proposed_role: proposedRole,
    invited_by: profile.id,
    expires_at: expiresAt,
  });
  if (insErr) {
    console.error("staff_invitations insert after successful invite", insErr.message);
  }

  revalidatePath("/rental/onboarding");
  revalidatePath("/rental/staff");
  return { ok: true };
}

export async function updateMembershipRoleAction(
  membershipId: string,
  nextRole: CompanyMembershipRole,
  opts?: { confirmDemoteLastOwner?: boolean },
): Promise<StaffActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return { ok: false, error: frozen.error };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!isRentalAdmin(profile)) {
    return { ok: false, error: "Only owners or admins can change roles." };
  }

  const mid = membershipId.trim();
  if (!mid) return { ok: false, error: "Missing membership." };

  const supabase = await createClient();
  const { data: row, error: gErr } = await supabase
    .from("user_company_memberships")
    .select("id, user_id, parent_company_id, role")
    .eq("id", mid)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!row || row.parent_company_id !== companyId) {
    return { ok: false, error: "Membership not found." };
  }

  const isSelf = row.user_id === profile.id;
  const canAssignOwner =
    profile.membership_role === "owner" || (isSelf && nextRole === "owner");
  if (nextRole === "owner" && !canAssignOwner) {
    return { ok: false, error: "Only an owner can assign the owner role to someone else. You can restore your own account to owner if needed." };
  }
  if (row.role === "owner" && profile.membership_role !== "owner" && !isSelf) {
    return { ok: false, error: "You cannot change another owner’s role." };
  }

  if (row.role === "owner" && nextRole !== "owner") {
    const { count, error: cErr } = await supabase
      .from("user_company_memberships")
      .select("id", { count: "exact", head: true })
      .eq("parent_company_id", companyId)
      .eq("status", "active")
      .eq("role", "owner");
    if (cErr) return { ok: false, error: cErr.message };
    if ((count ?? 0) <= 1 && !opts?.confirmDemoteLastOwner) {
      return {
        ok: false,
        code: "LAST_OWNER_CONFIRM",
        error:
          "This is the only owner for the company. Demoting them leaves the tenant without an owner until someone is promoted again or support helps. Confirm to continue.",
      };
    }
  }

  const { error: uErr } = await supabase
    .from("user_company_memberships")
    .update({ role: nextRole })
    .eq("id", mid);
  if (uErr) return { ok: false, error: uErr.message };

  revalidateProfileBundle(row.user_id);
  revalidatePath("/rental/staff");
  return { ok: true };
}

const MEMBERSHIP_STATUSES = new Set(["active", "invited", "suspended"]);

export async function updateMembershipStatusAction(
  membershipId: string,
  nextStatus: "active" | "invited" | "suspended",
): Promise<StaffActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return { ok: false, error: frozen.error };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!isRentalAdmin(profile)) {
    return { ok: false, error: "Only owners or admins can change membership status." };
  }

  const mid = membershipId.trim();
  if (!mid) return { ok: false, error: "Missing membership." };
  if (!MEMBERSHIP_STATUSES.has(nextStatus)) {
    return { ok: false, error: "Invalid status." };
  }

  const supabase = await createClient();
  const { data: row, error: gErr } = await supabase
    .from("user_company_memberships")
    .select("id, user_id, parent_company_id, role, status")
    .eq("id", mid)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!row || row.parent_company_id !== companyId) {
    return { ok: false, error: "Membership not found." };
  }

  const isSelf = row.user_id === profile.id;
  if (row.role === "owner" && profile.membership_role !== "owner" && !isSelf) {
    return { ok: false, error: "You cannot change another owner’s account status." };
  }

  if (row.role === "owner" && nextStatus === "suspended") {
    const { count, error: cErr } = await supabase
      .from("user_company_memberships")
      .select("id", { count: "exact", head: true })
      .eq("parent_company_id", companyId)
      .eq("status", "active")
      .eq("role", "owner");
    if (cErr) return { ok: false, error: cErr.message };
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error:
          "Cannot suspend the only active owner. Promote another owner or change this account’s role first.",
      };
    }
  }

  const { error: uErr } = await supabase
    .from("user_company_memberships")
    .update({ status: nextStatus })
    .eq("id", mid);
  if (uErr) return { ok: false, error: uErr.message };

  revalidateProfileBundle(row.user_id);
  revalidatePath("/rental/staff");
  return { ok: true };
}

export async function setMembershipSubcompanyScopeAction(
  membershipId: string,
  scope: "all" | "explicit",
  subcompanyIds: string[],
): Promise<StaffActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return { ok: false, error: frozen.error };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  if (!isRentalAdmin(profile)) {
    return { ok: false, error: "Only owners or admins can manage access." };
  }

  const mid = membershipId.trim();
  if (!mid) return { ok: false, error: "Missing membership." };

  const supabase = await createClient();
  const { data: row, error: gErr } = await supabase
    .from("user_company_memberships")
    .select("id, parent_company_id, role")
    .eq("id", mid)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!row || row.parent_company_id !== companyId) {
    return { ok: false, error: "Membership not found." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const deleteSubcompanyPerms = async () => {
    const { error: delErr } = await admin.from("user_subcompany_permissions").delete().eq("membership_id", mid);
    if (delErr) return delErr.message;
    return null;
  };

  if (row.role === "owner" || row.role === "admin") {
    const { error: sErr } = await supabase
      .from("user_company_memberships")
      .update({ subcompany_scope: "all" })
      .eq("id", mid);
    if (sErr) return { ok: false, error: sErr.message };
    const delMsg = await deleteSubcompanyPerms();
    if (delMsg) return { ok: false, error: delMsg };
    revalidatePath("/rental/staff");
    return { ok: true };
  }

  const { error: sErr } = await supabase
    .from("user_company_memberships")
    .update({ subcompany_scope: scope })
    .eq("id", mid);
  if (sErr) return { ok: false, error: sErr.message };

  const delMsg = await deleteSubcompanyPerms();
  if (delMsg) return { ok: false, error: delMsg };

  const dedupedIds = [...new Set(subcompanyIds.map((id) => id.trim()).filter(Boolean))];

  if (scope === "explicit" && dedupedIds.length === 0) {
    return { ok: false, error: "Choose at least one subcompany, or set access to all locations." };
  }

  if (scope === "explicit" && dedupedIds.length > 0) {
    const { data: subs, error: subErr } = await supabase
      .from("subcompanies")
      .select("id")
      .eq("parent_company_id", companyId);
    if (subErr) return { ok: false, error: subErr.message };
    const allowed = new Set((subs ?? []).map((s) => s.id));
    const permRows = dedupedIds.filter((id) => allowed.has(id)).map((subcompany_id) => ({ membership_id: mid, subcompany_id }));
    if (permRows.length > 0) {
      const { error: pErr } = await admin.from("user_subcompany_permissions").insert(permRows);
      if (pErr) return { ok: false, error: pErr.message };
    }
  }

  revalidatePath("/rental/staff");
  return { ok: true };
}
