import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddStaffForm, AdminSubcompanyForm } from "./ui";

export default async function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company, error: cErr } = await supabase
    .from("rental_company")
    .select("id, name, email, address, contact_number, company_reg_no, status")
    .eq("id", id)
    .maybeSingle();

  if (cErr || !company) notFound();

  const { data: subs } = await supabase
    .from("subcompany")
    .select("id, name, email, created_at")
    .eq("company_id", id)
    .order("created_at", { ascending: true });

  const { data: staff } = await supabase
    .from("company_staff")
    .select("id, display_name, user_id, is_active")
    .eq("company_id", id);

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/admin/companies"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          ← All companies
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-zinc-900">{company.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {company.email ?? "—"} · {company.status}
        </p>
      </div>

      <AdminSubcompanyForm companyId={company.id} />

      <AddStaffForm companyId={company.id} />

      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Subcompanies</h2>
        </div>
        <ul className="divide-y divide-zinc-100">
          {(subs ?? []).length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-500">None yet.</li>
          ) : (
            (subs ?? []).map((s) => (
              <li key={s.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-zinc-900">{s.name}</p>
                {s.email ? <p className="text-xs text-zinc-500">{s.email}</p> : null}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Staff</h2>
        </div>
        <ul className="divide-y divide-zinc-100">
          {(staff ?? []).length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-500">No staff linked.</li>
          ) : (
            (staff ?? []).map((s) => (
              <li key={s.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-zinc-900">
                  {s.display_name ?? s.user_id.slice(0, 8)}
                </p>
                <p className="text-xs text-zinc-500">
                  {s.is_active ? "active" : "inactive"} · user {s.user_id}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
