import { redirect } from "next/navigation";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { loadPendingContractRenewal } from "@/lib/companies/pending-contract-renewal";
import { issueInAppRecipientSigningLink } from "@/lib/esign/envelope";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Opens the renewal contract signing flow for the logged-in signatory. */
export default async function RentalContractRenewalSignPage() {
  const { profile } = await requireRentalCompanyArea({ skipActiveContractRequirement: true });
  const user = await getSessionUser();
  const companyId = profile.company_id?.trim();
  if (!companyId || !user?.email) {
    redirect("/rental/awaiting-contract?signError=Missing%20account%20context.");
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    redirect("/rental/awaiting-contract?signError=Signing%20is%20temporarily%20unavailable.");
  }

  const pending = await loadPendingContractRenewal(admin, companyId);
  if (!pending?.envelopeId || !pending.signReady) {
    const msg = encodeURIComponent(pending?.signBlockedReason ?? "Contract not ready for signature.");
    redirect(`/rental/awaiting-contract?signError=${msg}`);
  }

  const issued = await issueInAppRecipientSigningLink(admin, pending.envelopeId, user.email);
  if (!issued.ok) {
    redirect(`/rental/awaiting-contract?signError=${encodeURIComponent(issued.error)}`);
  }

  redirect(issued.signPath);
}
