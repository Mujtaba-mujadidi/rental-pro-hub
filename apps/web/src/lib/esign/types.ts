export const ESIGN_BUCKET = "esign-documents";

/** Extensible: company agreements, rental agreements, driver docs later. */
export type EsignContextType = "platform_company_contract" | (string & {});

export type EsignEnvelopeStatus =
  | "draft"
  | "awaiting_placement"
  | "owner_signed"
  | "sent"
  | "viewed"
  | "completed"
  | "void"
  | "expired";

export type EsignFieldType = "signature" | "date" | "text";

/** Normalized page coordinates (0–1 relative to page width/height). */
export type EsignFieldLayoutItem = {
  id: string;
  type: EsignFieldType;
  role: string;
  page: number; // 1-based
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** When set, value is copied from the referenced field id at stamp time (per-page paraph). */
  derivedFrom?: string;
};

export type EsignRecipientInput = {
  email: string;
  name?: string | null;
  role?: string;
};

export const DEFAULT_SIGNER_ROLE = "recipient";

export const ESIGN_OWNER_ROLE = "owner";
export const ESIGN_RECIPIENT_ROLE = "recipient";

/** Default UK contract retention hint: 6 years after completion. */
export const ESIGN_DEFAULT_RETENTION_YEARS = 6;
