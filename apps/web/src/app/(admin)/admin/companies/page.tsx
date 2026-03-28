import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateCompanyForm } from "./ui";

export default async function AdminCompaniesPage() {
  const supabase = await createClient();
  const { data: companies, error } = await supabase
    .from("rental_company")
    .select("id, name, email, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Could not load companies: {error.message}
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Rental companies</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Parent tenants on the platform. Staff are linked by email after they sign
          up.
        </p>
      </div>

      <CreateCompanyForm />

      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">All companies</h2>
        </div>
        <ul className="divide-y divide-zinc-100">
          {(companies ?? []).length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-500">No companies yet.</li>
          ) : (
            (companies ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium text-zinc-900">{c.name}</p>
                  <p className="text-xs text-zinc-500">
                    {c.email ?? "—"} · {c.status}
                  </p>
                </div>
                <Link
                  href={`/admin/companies/${c.id}`}
                  className="text-sm font-medium text-zinc-900 underline"
                >
                  Manage
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
