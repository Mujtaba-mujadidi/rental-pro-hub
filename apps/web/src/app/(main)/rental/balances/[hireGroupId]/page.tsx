import { HireBalanceWorkspaceView } from "../hire-balance-workspace-view";

export default async function RentalBalanceWorkspacePage({
  params,
}: {
  params: Promise<{ hireGroupId: string }>;
}) {
  const { hireGroupId } = await params;
  return <HireBalanceWorkspaceView hireGroupId={hireGroupId} />;
}
