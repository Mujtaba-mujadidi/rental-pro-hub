import { FleetHiresView } from "@/app/(main)/rental/hires/fleet-hires-view";
import { getSubcompanyWorkspaceShell } from "@/lib/rental/load-subcompany-workspace-shell";
import { notFound } from "next/navigation";

export default async function SubcompanyHiresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shell = await getSubcompanyWorkspaceShell(id);
  if (!shell.ok) notFound();

  return <FleetHiresView lockedSubcompanyId={shell.shell.subcompany.id} />;
}
