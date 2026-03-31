import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/profile";

export default async function SuperAdminHomePage() {
  const { profile } = await requireSuperAdmin();

  return (
    <div className="space-y-4">
      <h1 className="rph-h1">Dashboard</h1>
      <p className="rph-lead">
        Signed in as <span className="rph-strong">{profile.display_name ?? "Admin"}</span>.
      </p>
      <p className="rph-muted text-sm">
        Browse everyone who completed driver registration and open their account in a new tab.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/super-admin/companies"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Companies
        </Link>
        <Link
          href="/super-admin/drivers"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Registered drivers
        </Link>
      </div>
    </div>
  );
}
