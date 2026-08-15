import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadSubcompanySwitcherListAction } from "@/app/actions/rental-subcompany-workspace";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { getSubcompanyWorkspaceShell } from "@/lib/rental/load-subcompany-workspace-shell";
import { AttentionOpenCountBadge } from "./attention-open-count-badge";
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
  const [result, switcher] = await Promise.all([
    getSubcompanyWorkspaceShell(id),
    loadSubcompanySwitcherListAction(),
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

  return (
    <SubcompanyWorkspaceProvider shell={result.shell}>
      <Suspense
        fallback={
          <div className="mb-5 h-40 animate-pulse rounded-xl border border-rph-border bg-rph-raised" />
        }
      >
        <SubcompanyWorkspaceTopBar
          subcompanies={switcher}
          attentionBadge={
            <Suspense fallback={null}>
              <AttentionOpenCountBadge companyId={companyId} subcompanyId={id} />
            </Suspense>
          }
        />
      </Suspense>
      {children}
    </SubcompanyWorkspaceProvider>
  );
}
