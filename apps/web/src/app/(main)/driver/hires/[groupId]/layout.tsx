import { notFound } from "next/navigation";
import { requireDriverArea } from "@/lib/auth/profile";
import { loadDriverHireWorkspaceShellAction } from "@/app/actions/driver-hires";
import { getDriverHireWorkspaceChrome } from "@/lib/fleet/load-driver-hire-workspace-chrome";
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
  const [shell, chrome] = await Promise.all([
    loadDriverHireWorkspaceShellAction(groupId),
    getDriverHireWorkspaceChrome(groupId),
  ]);
  if (!shell.ok) notFound();
  if (!chrome.ok) notFound();

  return (
    <DriverHireWorkspaceProvider shell={shell.shell} chrome={chrome.chrome}>
      <DriverHireWorkspaceTopBar />
      {children}
    </DriverHireWorkspaceProvider>
  );
}
