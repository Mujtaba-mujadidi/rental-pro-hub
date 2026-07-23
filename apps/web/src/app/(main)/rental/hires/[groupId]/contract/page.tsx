import { redirect } from "next/navigation";

type Props = { params: Promise<{ groupId: string }> };

export default async function HireContractRedirectPage({ params }: Props) {
  const { groupId } = await params;
  redirect(`/rental/hires/${groupId}/details`);
}
