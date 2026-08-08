import { redirect } from "next/navigation";

export default async function LegacySubcompanyHiresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/rental/subcompany/${id}?section=hires`);
}
