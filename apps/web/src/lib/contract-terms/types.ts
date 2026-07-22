/** Shared shape for versioned terms rows (platform catalog + company hire terms). */
export type TermsVersionRow = {
  id: string;
  version_label: string;
  title: string;
  body: string;
  body_hash?: string;
  status: string;
  published_at: string | null;
  created_at: string;
};

export type TermsVersionSaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type TermsVersionActionResult = { ok: true } | { ok: false; error: string };

export type TermsVersionsClientActions = {
  saveDraft: (formData: FormData) => Promise<TermsVersionSaveResult>;
  publish: (versionId: string) => Promise<TermsVersionActionResult>;
  archive: (versionId: string) => Promise<TermsVersionActionResult>;
  republishArchived: (versionId: string) => Promise<TermsVersionActionResult>;
};
