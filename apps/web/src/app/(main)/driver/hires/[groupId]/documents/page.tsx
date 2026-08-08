import { redirect } from "next/navigation";
import { driverHireWorkspaceHref } from "@/lib/fleet/driver-hire-workspace-nav";

/** Signed documents live on Details — keep this route as a redirect for old links. */
export default async function DriverHireDocumentsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  redirect(driverHireWorkspaceHref(groupId, "details"));
}
