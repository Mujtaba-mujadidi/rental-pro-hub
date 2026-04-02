import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { redirectIfRentalOnboardingIncomplete } from "@/lib/auth/rental-onboarding";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { StaffDirectory } from "./staff-directory";
import { StaffInviteTrigger } from "./invite-staff-modal";

export default async function RentalStaffPage() {
  const { profile } = await requireRentalCompanyArea();
  await redirectIfRentalOnboardingIncomplete(profile.company_id);

  const companyId = profile.company_id?.trim();
  if (!companyId) {
    return <p className="rph-muted text-sm">No company is linked to this account.</p>;
  }

  const supabase = await createClient();
  const { data: memberships, error: mErr } = await supabase
    .from("user_company_memberships")
    .select("id, user_id, role, subcompany_scope, status, created_at")
    .eq("parent_company_id", companyId)
    .order("created_at", { ascending: true });

  if (mErr) {
    return <p className="rph-alert-error text-sm">Could not load team ({mErr.message}).</p>;
  }

  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  const mids = (memberships ?? []).map((m) => m.id);

  const nameByUser = new Map<string, string | null>();
  const emailByUser = new Map<string, string | null>();
  let permRows: { membership_id: string; subcompany_id: string }[] = [];

  if (userIds.length > 0 || mids.length > 0) {
    try {
      const admin = createSupabaseAdminClient();
      if (userIds.length > 0) {
        const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", userIds);
        for (const p of profs ?? []) {
          nameByUser.set(p.id, p.display_name);
        }
        const emailPairs = await Promise.all(
          userIds.map((uid) =>
            admin.auth.admin.getUserById(uid).then(({ data, error }) => {
              if (error || !data?.user) return [uid, null] as const;
              return [uid, data.user.email ?? null] as const;
            }),
          ),
        );
        for (const [uid, em] of emailPairs) {
          emailByUser.set(uid, em);
        }
      }
      if (mids.length > 0) {
        const { data: perms } = await admin
          .from("user_subcompany_permissions")
          .select("membership_id, subcompany_id")
          .in("membership_id", mids);
        permRows = perms ?? [];
      }
    } catch {
      // Service role not configured: names/emails may be empty; permission rows only visible for own membership via RLS.
      if (mids.length > 0) {
        const { data } = await supabase
          .from("user_subcompany_permissions")
          .select("membership_id, subcompany_id")
          .in("membership_id", mids);
        permRows = data ?? [];
      }
    }
  }

  const { data: subs } = await supabase
    .from("subcompanies")
    .select("id, name, is_primary")
    .eq("parent_company_id", companyId)
    .order("created_at", { ascending: true });

  const explicitSubsByMembership = new Map<string, string[]>();
  for (const r of permRows ?? []) {
    const list = explicitSubsByMembership.get(r.membership_id) ?? [];
    list.push(r.subcompany_id);
    explicitSubsByMembership.set(r.membership_id, list);
  }

  const canManage = profile.membership_role === "owner" || profile.membership_role === "admin";

  const ownerCount = (memberships ?? []).filter((m) => m.role === "owner" && m.status === "active").length;

  const members = (memberships ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role as import("@/lib/auth/profile").CompanyMembershipRole,
    subcompany_scope: (m.subcompany_scope === "explicit" ? "explicit" : "all") as "all" | "explicit",
    display_name: nameByUser.get(m.user_id) ?? null,
    email: emailByUser.get(m.user_id) ?? null,
    status: m.status as "active" | "invited" | "suspended",
    created_at: m.created_at,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rph-h1">Staff</h1>
          <p className="rph-muted mt-1 max-w-2xl text-sm">
            Invite colleagues and control their role and which subcompany locations they can see. Owners and admins always
            have access to all locations.
          </p>
        </div>
        {canManage ? <StaffInviteTrigger subcompanies={subs ?? []} /> : null}
      </div>

      <StaffDirectory
        members={members}
        subcompanies={subs ?? []}
        explicitSubsByMembership={Object.fromEntries(explicitSubsByMembership)}
        canManage={canManage}
        currentUserId={profile.id}
        ownerCount={ownerCount}
      />
    </div>
  );
}
