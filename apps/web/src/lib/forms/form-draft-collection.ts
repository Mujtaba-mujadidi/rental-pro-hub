import { companyIdentitiesMatch, type CompanyIdentityFields } from "@/lib/companies/company-identity";
import { clearDraft, formDraftStorageKey, loadDraft, saveDraft } from "@/lib/forms/form-draft";

export type FormDraftMeta = {
  id: string;
  label: string;
  updatedAt: string;
};

type DraftIndex = {
  version: 1;
  items: FormDraftMeta[];
};

const INDEX_PREFIX = "rph:form-draft-index:";

function indexKey(collection: string): string {
  return `${INDEX_PREFIX}${collection}`;
}

function readIndex(collection: string): DraftIndex {
  if (typeof window === "undefined") return { version: 1, items: [] };
  try {
    const raw = window.localStorage.getItem(indexKey(collection));
    if (!raw) return { version: 1, items: [] };
    const parsed = JSON.parse(raw) as DraftIndex;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) {
      return { version: 1, items: [] };
    }
    return { version: 1, items: parsed.items.filter((i) => i && typeof i.id === "string") };
  } catch {
    return { version: 1, items: [] };
  }
}

function writeIndex(collection: string, index: DraftIndex): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(indexKey(collection), JSON.stringify(index));
  } catch (e) {
    console.warn("[form-draft-index] save failed", e);
  }
}

export function collectionItemDraftKey(collection: string, draftId: string): string {
  return `${collection}:${draftId}`;
}

export function listCollectionDrafts(collection: string): FormDraftMeta[] {
  const items = readIndex(collection).items;
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Create a new draft slot in the collection index (data is empty until saveDraft). */
export function createCollectionDraft(collection: string, label = "Untitled draft"): FormDraftMeta {
  const now = new Date().toISOString();
  const meta: FormDraftMeta = { id: newId(), label: label.trim() || "Untitled draft", updatedAt: now };
  const index = readIndex(collection);
  index.items = [meta, ...index.items.filter((i) => i.id !== meta.id)];
  writeIndex(collection, index);
  return meta;
}

export function updateCollectionDraftMeta(
  collection: string,
  draftId: string,
  patch: { label?: string },
): FormDraftMeta | null {
  const index = readIndex(collection);
  const i = index.items.findIndex((x) => x.id === draftId);
  if (i < 0) return null;
  const next: FormDraftMeta = {
    ...index.items[i]!,
    updatedAt: new Date().toISOString(),
    ...(patch.label != null ? { label: patch.label.trim() || "Untitled draft" } : {}),
  };
  index.items[i] = next;
  writeIndex(collection, index);
  return next;
}

export function removeCollectionDraft(collection: string, draftId: string): void {
  const index = readIndex(collection);
  index.items = index.items.filter((i) => i.id !== draftId);
  writeIndex(collection, index);
  clearDraft(collectionItemDraftKey(collection, draftId));
}

/**
 * If an older single-key draft exists (pre multi-draft), move it into the collection once.
 */
export function migrateLegacySingleDraft(collection: string, legacyDraftKey: string): void {
  if (typeof window === "undefined") return;
  const legacy = loadDraft<unknown>(legacyDraftKey);
  if (!legacy) return;

  const already = listCollectionDrafts(collection);
  // Avoid duplicate migration if index already has items and legacy still sits around.
  const legacyStorage = formDraftStorageKey(legacyDraftKey);
  try {
    const labelFromData = (() => {
      const data = legacy.data as { draft?: { name?: string }; name?: string } | null;
      const name = data?.draft?.name?.trim() || data?.name?.trim();
      return name || "Untitled draft";
    })();

    if (already.length === 0) {
      const meta = createCollectionDraft(collection, labelFromData);
      saveDraft(collectionItemDraftKey(collection, meta.id), legacy.data);
      updateCollectionDraftMeta(collection, meta.id, { label: labelFromData });
    }
    window.localStorage.removeItem(legacyStorage);
  } catch (e) {
    console.warn("[form-draft] legacy migrate failed", e);
  }
}

export { saveDraft, loadDraft, clearDraft };

type RegisterCompanyDraftPayload = {
  draft?: {
    name?: string;
    primary_contact_email?: string;
    company_number?: string;
  };
};

/**
 * Drop local collection drafts that match companies already in the database
 * (same name, primary contact email, or company number).
 */
export function pruneCollectionDraftsMatchingCompanies(
  collection: string,
  companies: CompanyIdentityFields[],
): number {
  if (typeof window === "undefined" || companies.length === 0) return 0;
  let removed = 0;
  for (const meta of listCollectionDrafts(collection)) {
    const stored = loadDraft<RegisterCompanyDraftPayload>(collectionItemDraftKey(collection, meta.id));
    const d = stored?.data?.draft;
    if (!d) continue;
    const identity: CompanyIdentityFields = {
      name: d.name ?? meta.label ?? "",
      primary_contact_email: d.primary_contact_email ?? null,
      company_number: d.company_number ?? null,
    };
    if (!identity.name.trim() && !identity.primary_contact_email && !identity.company_number) continue;
    const hit = companies.some((c) => companyIdentitiesMatch(identity, c));
    if (hit) {
      removeCollectionDraft(collection, meta.id);
      removed += 1;
    }
  }
  return removed;
}
