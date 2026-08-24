import { notFound } from "next/navigation";
import { repairAutoCompletedEndHireOnLoadAction } from "@/app/actions/hire-end-hire";
import { getAppProfile } from "@/lib/auth/profile";
import { canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import { getStaffHireWorkspaceChrome } from "@/lib/fleet/load-hire-workspace-chrome";
import { getHireWorkspaceShell, loadHireSwitcherList } from "@/lib/fleet/load-hire-workspace-shell";
import { HireWorkspaceProvider } from "./hire-workspace-provider";
import { HireWorkspaceTopBar } from "./hire-workspace-top-bar";

export default async function HireWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const profile = await getAppProfile();
  if (!profile || !canReadRentals(profile)) notFound();

  const { groupId } = await params;
  if (canWriteRentals(profile)) {
    await repairAutoCompletedEndHireOnLoadAction(groupId);
  }

  const [shell, chrome, hiresList] = await Promise.all([
    getHireWorkspaceShell(groupId),
    getStaffHireWorkspaceChrome(groupId),
    loadHireSwitcherList(),
  ]);

  if (!shell.ok) notFound();
  if (!chrome.ok) notFound();
  if (!hiresList.ok) {
    return <p className="rph-alert-error text-sm">{hiresList.error}</p>;
  }

  return (
    <HireWorkspaceProvider shell={shell} chrome={chrome.chrome}>
      <HireWorkspaceTopBar hires={hiresList.hires} />
      {children}
    </HireWorkspaceProvider>
  );
}
