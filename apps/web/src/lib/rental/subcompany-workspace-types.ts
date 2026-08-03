/** Shapes shared between the subcompany workspace UI and its server actions. */

export type SubcompanyDocumentKind = "hire_agreement" | "permission_letter";

export const SUBCOMPANY_DOCUMENT_KIND_LABELS: Record<SubcompanyDocumentKind, string> = {
  hire_agreement: "Hire agreement",
  permission_letter: "Permission letter",
};

/** Open `subcompany_hire_document_requirements` row surfaced on the overview. */
export type SubcompanyOpenRequirement = {
  id: string;
  hireGroupId: string;
  documentKind: SubcompanyDocumentKind;
  agreementId: string | null;
  /** Human label for the hire (e.g. "AB12 CDE · Jane Doe"). */
  label: string;
  href: string;
};
