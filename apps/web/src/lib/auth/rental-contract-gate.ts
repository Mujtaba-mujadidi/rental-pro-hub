import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-only: send rental users to awaiting-contract until the parent agreement is active. */
export async function redirectIfRentalContractNotActive(companyId: string | null | undefined) {
  const id = companyId?.trim();
  if (!id) return;
  const supabase = await createClient();
  const { data: cc, error } = await supabase
    .from("company_contracts")
    .select("status")
    .eq("parent_company_id", id)
    .maybeSingle();
  if (error || (cc?.status as string | undefined) !== "active") {
    redirect("/rental/awaiting-contract");
  }
}
