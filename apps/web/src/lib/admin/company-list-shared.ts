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
  createdAt: string;
  hasLogo: boolean;
  inviteLastSentAt: string | null;
};
