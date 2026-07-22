"use client";

import {
  archiveContractTermsVersionAction,
  listContractTermsAdminAction,
  publishContractTermsVersionAction,
  republishArchivedContractTermsVersionAction,
  saveContractTermsDraftAction,
  type ContractTermsVersionRow,
} from "@/app/actions/contract-terms";
import { TermsVersionsClient } from "@/components/contract-terms/terms-versions-client";
import type { TermsVersionRow } from "@/lib/contract-terms/types";

const PLATFORM_TERMS_CONFIG = {
  scopeLabel: "All rental companies",
  scopeDescription: "Master rental agreement",
  modalDescription: "Add or update master terms used when registering rental companies.",
  publishAfterSaveHelp:
    "Makes this the active published version for new company registrations (any current published version is archived).",
  draftKeyPrefix: "contract-terms",
  searchPlaceholder: "Search terms & conditions",
} as const;

const platformActions = {
  saveDraft: saveContractTermsDraftAction,
  publish: publishContractTermsVersionAction,
  archive: archiveContractTermsVersionAction,
  republishArchived: republishArchivedContractTermsVersionAction,
};

export function ContractTermsClient({ initialRows }: { initialRows: ContractTermsVersionRow[] }) {
  return (
    <TermsVersionsClient
      initialRows={initialRows as TermsVersionRow[]}
      actions={platformActions}
      config={PLATFORM_TERMS_CONFIG}
      canManage
    />
  );
}
