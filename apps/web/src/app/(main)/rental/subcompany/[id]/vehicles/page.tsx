import { redirect } from "next/navigation";

export default async function LegacySubcompanyVehiclesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/rental/subcompany/${id}?section=vehicles`);
}
