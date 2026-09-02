import { notFound } from "next/navigation";
import { loadHirePaymentsPageAction } from "@/app/actions/hire-payments";
import { HireSettlementStatementView } from "@/components/fleet/hire-payments/hire-settlement-statement-view";

export default async function HireSettlementStatementPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const result = await loadHirePaymentsPageAction(groupId);
  if (!result.ok) notFound();

  return <HireSettlementStatementView hireGroupId={groupId} data={result.data} />;
}
