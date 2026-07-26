/** Client-safe row type for the super-admin company list. */

export type AdminCompanyListRow = {
  id: string;
  name: string;
  legalName: string | null;
  companyNumber: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  email: string | null;
  phone: string | null;
  town: string | null;
  postcode: string | null;
  status: string;
  contractStatus: string | null;
  /** company_contracts.status when linked (draft, active, …). */
  agreementContractStatus: string | null;
  /** Open agreement change request for this company (renewal in progress). */
  openChangeRequestId: string | null;
  /** E-sign envelope linked to the open change request, when prepared. */
  openChangeEsignEnvelopeId: string | null;
  /** In-prep platform agreement envelope (designer / regenerate), if any. */
  platformEsignEnvelopeId: string | null;
  createdAt: string;
  hasLogo: boolean;
  inviteLastSentAt: string | null;
  /** Auth user id for the primary contact when linked. */
  primaryContactUserId: string | null;
  /**
   * True once the invited primary contact has signed in at least once.
   * `null` until resolved lazily (row menu open) so list load stays fast.
   */
  primaryContactHasSignedIn: boolean | null;
  /** Company deletion lifecycle (offboarding / access block before purge). */
  deletionPhase: "active" | "offboarding" | "access_blocked";
  offboardingEndsAt: string | null;
};

/** Full-row payloads for the super-admin company detail modal (server-fetched). */
export type AdminCompanyDetailPayload = {
  company: Record<string, unknown>;
  subcompanies: Record<string, unknown>[];
  companyContract: Record<string, unknown> | null;
};
