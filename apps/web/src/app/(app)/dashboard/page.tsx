import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/profile";

export default async function DashboardPage() {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();

  const { data: staffRows } =
    profile.user_type === "company_staff"
      ? await supabase
          .from("company_staff")
          .select("id, company_id, rental_company (id, name)")
          .eq("user_id", user.id)
          .eq("is_active", true)
      : { data: null as null };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Signed in as{" "}
          <span className="font-medium text-zinc-800">
            {profile.display_name ?? "User"}
          </span>
          . Role:{" "}
          <span className="font-mono text-xs text-zinc-700">{profile.user_type}</span>
        </p>
      </div>

      {profile.user_type === "driver" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Driver</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Vehicle and rental features arrive in later phases. For now you can
            browse your profile once we add the profile screen.
          </p>
        </section>
      ) : null}

      {profile.user_type === "company_staff" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Your companies</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            {(staffRows ?? []).map((row) => {
              const raw = row.rental_company as unknown;
              const rc =
                raw &&
                typeof raw === "object" &&
                !Array.isArray(raw) &&
                "id" in raw &&
                "name" in raw
                  ? (raw as { id: string; name: string })
                  : null;
              if (!rc) return null;
              return (
                <li key={row.id}>
                  <Link
                    href={`/company/subcompanies?companyId=${rc.id}`}
                    className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                  >
                    {rc.name}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-zinc-500">
            Manage subcompanies under <strong>Subcompanies</strong> in the header.
          </p>
        </section>
      ) : null}

      {profile.user_type === "platform_admin" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Platform admin</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Create rental companies and link staff from the admin area.
          </p>
          <Link
            href="/admin/companies"
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white"
          >
            Open admin
          </Link>
        </section>
      ) : null}
    </div>
  );
}
