import { notFound } from "next/navigation";
import { requireDriverArea } from "@/lib/auth/profile";
import { loadDriverHireWorkspaceShellAction } from "@/app/actions/driver-hires";
import { DriverHireWorkspaceProvider } from "./driver-hire-workspace-provider";
import { DriverHireWorkspaceTopBar } from "./driver-hire-workspace-top-bar";

export default async function DriverHireWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  await requireDriverArea();
  const { groupId } = await params;
  const shell = await loadDriverHireWorkspaceShellAction(groupId);
  if (!shell.ok) notFound();

  return (
    <DriverHireWorkspaceProvider shell={shell.shell}>
      <DriverHireWorkspaceTopBar />
      {children}
    </DriverHireWorkspaceProvider>
  );
}
