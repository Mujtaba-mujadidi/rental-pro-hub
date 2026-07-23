import { notFound } from "next/navigation";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
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
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) notFound();

  const { groupId } = await params;
  const [shell, hiresList] = await Promise.all([getHireWorkspaceShell(groupId), loadHireSwitcherList()]);

  if (!shell.ok) notFound();
  if (!hiresList.ok) {
    return <p className="rph-alert-error text-sm">{hiresList.error}</p>;
  }

  return (
    <HireWorkspaceProvider shell={shell}>
      <HireWorkspaceTopBar hires={hiresList.hires} />
      {children}
    </HireWorkspaceProvider>
  );
}
