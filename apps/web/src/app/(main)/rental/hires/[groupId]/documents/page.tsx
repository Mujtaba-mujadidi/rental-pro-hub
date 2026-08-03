import { redirect } from "next/navigation";
import { hireWorkspaceHref } from "@/lib/fleet/hire-workspace-nav";

/** Documents live on Details — keep this route as a redirect for old links. */
export default async function RentalHireSignedDocumentsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  redirect(hireWorkspaceHref(groupId, "details"));
}
