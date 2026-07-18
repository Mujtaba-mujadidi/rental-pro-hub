import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { formatUkDateLong } from "@/lib/datetime/uk";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function RentalOffboardingPage() {
  const { profile } = await requireRentalCompanyArea({ skipActiveContractRequirement: true });
  const companyId = profile.company_id;
  if (!companyId) redirect("/rental");

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name, deletion_phase, offboarding_ends_at")
    .eq("id", companyId)
    .maybeSingle();

  const phase = (company?.deletion_phase as string) ?? "active";
  if (phase === "access_blocked") {
    redirect("/rental/account-closed");
  }
  if (phase !== "offboarding") {
    redirect("/rental");
  }

  const endsLabel = company?.offboarding_ends_at ? formatUkDateLong(company.offboarding_ends_at, "") || null : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="rph-h1">Account offboarding</h1>
      <p className="rph-lead">
        {company?.name ? (
          <>
            <span className="rph-strong">{company.name}</span> is in a retention period before full closure.
          </>
        ) : (
          "Your organisation is in a retention period before full closure."
        )}
      </p>
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100">
        <p className="font-semibold">What this means</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-amber-900/90 dark:text-amber-100/90">
          <li>You can sign in to download an export of your company data (JSON).</li>
          <li>Other rental app features are unavailable during this phase.</li>
          {endsLabel ? (
            <li>
              After <span className="font-medium">{endsLabel}</span>, tenant sign-in will be blocked until the account is
              permanently removed or reactivated by an administrator.
            </li>
          ) : (
            <li>After the retention window ends, tenant sign-in will be blocked until the account is removed or reactivated.</li>
          )}
        </ul>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Questions about your contract or data should go to your platform administrator.
      </p>
      <div>
        <a
          href="/api/rental/offboarding-export"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Download data export (JSON)
        </a>
      </div>
    </div>
  );
}
