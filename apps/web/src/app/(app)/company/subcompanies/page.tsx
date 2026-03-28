import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/profile";
import { SubcompanyForms } from "./ui";

export default async function CompanySubcompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { user, profile } = await requireProfile();
  if (profile.user_type !== "company_staff") {
    return (
      <p className="text-sm text-zinc-600">
        Only company staff can manage subcompanies.{" "}
        <Link href="/dashboard" className="underline">
          Back to dashboard
        </Link>
      </p>
    );
  }

  const sp = await searchParams;
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("company_staff")
    .select("company_id, rental_company (id, name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const companies =
    memberships
      ?.map((m) => {
        const raw = m.rental_company as unknown;
        if (
          raw &&
          typeof raw === "object" &&
          !Array.isArray(raw) &&
          "id" in raw &&
          "name" in raw
        ) {
          return raw as { id: string; name: string };
        }
        return null;
      })
      .filter((c): c is { id: string; name: string } => c != null) ?? [];

  const companyId =
    sp.companyId && companies.some((c) => c.id === sp.companyId)
      ? sp.companyId
      : companies[0]?.id;

  if (!companyId) {
    return (
      <p className="text-sm text-zinc-600">
        You are not assigned to a company yet. Ask a platform admin to link your
        account.
      </p>
    );
  }

  const { data: subs } = await supabase
    .from("subcompany")
    .select("id, name, email, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  const companyName =
    companies.find((c) => c.id === companyId)?.name ?? "Company";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Subcompanies</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {companyName} — create and list subcompanies you can access.
        </p>
      </div>

      {companies.length > 1 ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-zinc-500">Company:</span>
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/company/subcompanies?companyId=${c.id}`}
              className={
                c.id === companyId
                  ? "font-semibold text-zinc-900"
                  : "text-zinc-600 underline"
              }
            >
              {c.name}
            </Link>
          ))}
        </div>
      ) : null}

      <SubcompanyForms companyId={companyId} />

      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Existing</h2>
        </div>
        <ul className="divide-y divide-zinc-100">
          {(subs ?? []).length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-500">No subcompanies yet.</li>
          ) : (
            (subs ?? []).map((s) => (
              <li key={s.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-zinc-900">{s.name}</p>
                {s.email ? (
                  <p className="text-xs text-zinc-500">{s.email}</p>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
