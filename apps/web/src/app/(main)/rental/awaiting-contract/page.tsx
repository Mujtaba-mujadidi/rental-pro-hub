import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { AwaitingContractClient } from "./awaiting-contract-client";

export default async function RentalAwaitingContractPage() {
  await requireRentalCompanyArea({ skipActiveContractRequirement: true });
  return <AwaitingContractClient />;
}
