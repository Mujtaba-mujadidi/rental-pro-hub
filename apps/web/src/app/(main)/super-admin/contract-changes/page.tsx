import { createClient } from "@/lib/supabase/server";
import { ContractChangesClient } from "./contract-changes-client";

export default async function ContractChangesPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("company_contract_change_requests")
    .select(
      "id, parent_company_id, status, review_status, transition_type, created_at, proposed_name, proposed_legal_name",
    )
    .eq("status", "pending_signature")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Contract changes</h1>
        <p className="rph-muted mt-2 max-w-3xl text-sm">
          Review rental requests first. For in-place legal updates, move to awaiting signature then apply. New legal entity
          requests are completed with the dedicated action (migrates memberships).
        </p>
      </div>
      <ContractChangesClient rows={(rows ?? []) as never} />
    </div>
  );
}
