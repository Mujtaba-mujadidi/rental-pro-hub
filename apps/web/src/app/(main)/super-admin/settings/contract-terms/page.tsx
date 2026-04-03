import { listContractTermsAdminAction } from "@/app/actions/contract-terms";
import { ContractTermsClient } from "./contract-terms-client";

export default async function ContractTermsSettingsPage() {
  const res = await listContractTermsAdminAction();
  const rows = res.ok ? res.rows : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Contract terms &amp; conditions</h1>
        <p className="rph-muted mt-2 max-w-3xl text-sm">
          Create drafts, optionally format with the built-in editor, then publish the version that applies to new rental
          registrations. Each signed contract keeps its own snapshot of the terms that were in effect.
        </p>
      </div>
      {!res.ok ? <p className="text-sm text-red-600">{res.error}</p> : null}
      <ContractTermsClient initialRows={rows} />
    </div>
  );
}
