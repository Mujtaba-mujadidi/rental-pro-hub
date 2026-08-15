import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadSubcompanySwitcherListAction } from "@/app/actions/rental-subcompany-workspace";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { getSubcompanyAttentionData } from "@/lib/rental/load-subcompany-attention-data";
import { getSubcompanyWorkspaceShell } from "@/lib/rental/load-subcompany-workspace-shell";
import { SubcompanyWorkspaceProvider } from "./subcompany-workspace-provider";
import { SubcompanyWorkspaceTopBar } from "./subcompany-workspace-top-bar";

export default async function SubcompanyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim() ?? "";
  const [result, switcher, attention] = await Promise.all([
    getSubcompanyWorkspaceShell(id),
    loadSubcompanySwitcherListAction(),
    companyId ? getSubcompanyAttentionData(companyId, id) : Promise.resolve(null),
  ]);

  if (!result.ok) {
    if (result.error === "Subcompany not found.") notFound();
    return (
      <div className="space-y-3">
        <p className="rph-alert-error text-sm">{result.error}</p>
        <p className="rph-muted text-sm">
          If this followed a recent update, apply the subcompany workspace migration (
          <code className="text-xs">20260730140000_subcompany_workspace</code>
          ) then refresh.
        </p>
      </div>
    );
  }
  if (!Array.isArray(switcher)) {
    return <p className="rph-alert-error text-sm">{switcher.error}</p>;
  }

  const attentionOpenCount =
    attention && attention.ok ? attention.data.summary.openCount : 0;

  return (
    <SubcompanyWorkspaceProvider shell={result.shell}>
      <Suspense
        fallback={
          <div className="mb-5 h-40 animate-pulse rounded-xl border border-rph-border bg-rph-raised" />
        }
      >
        <SubcompanyWorkspaceTopBar
          subcompanies={switcher}
          attentionOpenCount={attentionOpenCount}
        />
      </Suspense>
      {children}
    </SubcompanyWorkspaceProvider>
  );
}
