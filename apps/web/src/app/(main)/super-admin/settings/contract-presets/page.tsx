import { listPricingPresetsAdminAction } from "@/app/actions/contract-presets";
import { ContractPresetsClient } from "./contract-presets-client";

function isContractPricingPresetsSchemaError(message: string): boolean {
  return /contract_pricing_presets/i.test(message) && /schema cache/i.test(message);
}

export default async function ContractPresetsSettingsPage() {
  const res = await listPricingPresetsAdminAction();
  const rows = res.ok ? res.rows : [];
  const loadError = res.ok ? null : res.error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Contract pricing presets</h1>
        <p className="rph-muted mt-2 max-w-3xl text-sm">
          Presets seed commercial fields when registering a company. Contract e-sign is native RMS (see{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">docs/esign.md</code>
          ).
        </p>
      </div>

      {loadError && isContractPricingPresetsSchemaError(loadError) ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Database table missing</p>
          <p className="mt-2 leading-relaxed opacity-95">
            Your Supabase project does not have <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">public.contract_pricing_presets</code> yet
            (migration not applied). Open the <strong>SQL Editor</strong> for the same project as <code className="rounded bg-amber-100/80 px-1 text-xs dark:bg-amber-900/50">NEXT_PUBLIC_SUPABASE_URL</code> and run:
          </p>
          <code className="mt-3 block rounded-lg border border-amber-200/80 bg-white/80 px-3 py-2 font-mono text-xs text-slate-800 dark:border-amber-800/50 dark:bg-slate-900/80 dark:text-slate-200">
            supabase/manual/ensure_contract_pricing_presets.sql
          </code>
          <p className="mt-2 text-xs opacity-90">
            After it succeeds, reload this page. For a full billing schema, apply migration <code className="font-mono">20260403210000_rental_contract_billing_platform.sql</code> when you can.
          </p>
        </div>
      ) : null}

      {loadError && !isContractPricingPresetsSchemaError(loadError) ? (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      ) : null}

      <ContractPresetsClient initialRows={rows} loadError={loadError} />
    </div>
  );
}
