import { notFound } from "next/navigation";
import { loadHireAccessPageStateAction } from "@/app/actions/rental-hire-wizard";
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

  const res = await loadHireAccessPageStateAction(token);
  if (!res.ok) {
    if (res.gate === "expired") {
      return (
        <div className="rph-card flex-1 p-6 sm:p-8">
          <div className="mx-auto max-w-md space-y-3 text-center">
            <h1 className="rph-h1">Link expired</h1>
            <p className="rph-muted text-sm">
              This hire access request from <strong className="text-rph-fg">{res.companyName ?? "the rental company"}</strong>{" "}
              is no longer valid. It may have timed out or been locked after too many incorrect access codes. Ask the
              rental company to send a new access link and code.
            </p>
          </div>
        </div>
      );
    }
    notFound();
  }

  const approveIntent = sp.intent === "approve" || sp.approve === "1";
  const rejectIntent = sp.intent === "reject" || sp.reject === "1";

  return (
    <div className="rph-card flex-1 p-6 sm:p-8">
      <HireAccessClient
        token={token}
        approveIntent={approveIntent}
        rejectIntent={rejectIntent}
        initial={res}
      />
    </div>
  );
}
