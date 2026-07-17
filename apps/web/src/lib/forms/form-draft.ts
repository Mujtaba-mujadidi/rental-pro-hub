export type FormDraftRecord<T> = {
  version: 1;
  updatedAt: string;
  data: T;
};

const PREFIX = "rph:form-draft:";

export function formDraftStorageKey(id: string): string {
  return `${PREFIX}${id}`;
}

export function loadDraft<T>(id: string): FormDraftRecord<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(formDraftStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormDraftRecord<T>;
    if (!parsed || parsed.version !== 1 || parsed.data == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft<T>(id: string, data: T): FormDraftRecord<T> {
  const record: FormDraftRecord<T> = {
    version: 1,
    updatedAt: new Date().toISOString(),
    data,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(formDraftStorageKey(id), JSON.stringify(record));
    } catch (e) {
      console.warn("[form-draft] save failed", e);
    }
  }
  return record;
}

export function clearDraft(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(formDraftStorageKey(id));
  } catch {
    /* ignore */
  }
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(value);
}
