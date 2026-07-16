export type RentalSubcompanyListRow = {
  id: string;
  isPrimary: boolean;
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
};
