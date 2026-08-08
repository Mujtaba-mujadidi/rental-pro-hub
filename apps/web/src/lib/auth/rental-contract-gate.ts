import { redirect } from "next/navigation";
import { getRentalCompanyGateCached } from "@/lib/auth/company-gate-cache";

/** Server-only: send rental users to awaiting-contract until the parent agreement is active. */
export async function redirectIfRentalContractNotActive(companyId: string | null | undefined) {
  const id = companyId?.trim();
  if (!id) return;
  const gate = await getRentalCompanyGateCached(id);
  if (!gate.contractActive) redirect("/rental/awaiting-contract");
}
