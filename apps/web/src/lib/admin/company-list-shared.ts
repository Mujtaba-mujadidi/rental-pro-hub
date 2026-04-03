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
  createdAt: string;
  hasLogo: boolean;
  inviteLastSentAt: string | null;
};

/** Full-row payloads for the super-admin company detail modal (server-fetched). */
export type AdminCompanyDetailPayload = {
  company: Record<string, unknown>;
  subcompanies: Record<string, unknown>[];
  companyContract: Record<string, unknown> | null;
};
