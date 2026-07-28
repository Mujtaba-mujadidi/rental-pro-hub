import { redirect } from "next/navigation";
import { cache } from "react";
import { loadRentalContractAccessFresh } from "@/lib/auth/rental-lifecycle";

const getContractActive = cache(async (companyId: string) => {
  const fresh = await loadRentalContractAccessFresh(companyId);
  return fresh.contractActive;
});

/** Server-only: send rental users to awaiting-contract until the parent agreement is active. */
export async function redirectIfRentalContractNotActive(companyId: string | null | undefined) {
  const id = companyId?.trim();
  if (!id) return;
  const active = await getContractActive(id);
  if (!active) redirect("/rental/awaiting-contract");
}
