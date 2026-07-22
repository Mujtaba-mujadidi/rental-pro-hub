import {
  onPlatformCompanyContractOwnerSigned,
  onPlatformCompanyContractSigned,
} from "@/lib/esign/adapters/platform-company-contract";
import {
  onVehicleHireAgreementOwnerSigned,
  onVehicleHireAgreementSigned,
} from "@/lib/esign/adapters/vehicle-hire-agreement";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

type EnvelopeRef = {
  id: string;
  context_type: string;
  context_id: string;
  parent_company_id: string | null;
};

export async function dispatchEnvelopeCompleted(admin: Admin, envelope: EnvelopeRef): Promise<void> {
  await onPlatformCompanyContractSigned(admin, envelope);
  await onVehicleHireAgreementSigned(admin, envelope);
}

export async function dispatchEnvelopeOwnerSigned(admin: Admin, envelope: EnvelopeRef): Promise<void> {
  await onPlatformCompanyContractOwnerSigned(admin, envelope);
  await onVehicleHireAgreementOwnerSigned(admin, envelope);
}
