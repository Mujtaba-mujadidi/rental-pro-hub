import { notFound } from "next/navigation";
import { loadHireAccessByTokenAction } from "@/app/actions/rental-hire-wizard";
import { HireAccessClient } from "./hire-access-client";

export default async function HireAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ intent?: string; approve?: string; reject?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  if (!token?.trim()) notFound();

  const res = await loadHireAccessByTokenAction(token);
  if (!res.ok) notFound();

  const approveIntent = sp.intent === "approve" || sp.approve === "1";

  return (
    <HireAccessClient
      token={token}
      approveIntent={approveIntent}
      initial={{
        requestId: res.requestId,
        companyName: res.companyName,
        status: res.status,
        termsPreview: res.termsPreview,
        hireSummary: res.hireSummary,
      }}
    />
  );
}
