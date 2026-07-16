import Link from "next/link";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function RentalAccountClosedPage() {
  const { profile } = await requireRentalCompanyArea({ skipActiveContractRequirement: true });
  const companyId = profile.company_id;
  if (!companyId) redirect("/rental");

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name, deletion_phase").eq("id", companyId).maybeSingle();

  const phase = (company?.deletion_phase as string) ?? "active";
  if (phase === "offboarding") {
    redirect("/rental/offboarding");
  }
  if (phase === "active") {
    redirect("/rental");
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 text-center">
      <h1 className="rph-h1">Account closed</h1>
      <p className="rph-lead text-slate-700 dark:text-slate-300">
        {company?.name ? (
          <>
            Access for <span className="rph-strong">{company.name}</span> has ended. This account is no longer available in the
            rental portal.
          </>
        ) : (
          "Access for this organisation has ended. This account is no longer available in the rental portal."
        )}
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        If you believe this is a mistake, contact your platform administrator. They may still be able to reactivate the
        organisation before it is permanently deleted.
      </p>
      <p className="pt-2 text-sm">
        <Link href="/login" className="text-rph-rail underline-offset-2 hover:underline dark:text-rph-rail-softer">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
