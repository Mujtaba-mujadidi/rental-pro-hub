import type { EsignFieldLayoutItem } from "@/lib/esign/types";
import type { FieldValueMap } from "@/lib/esign/pdf-stamp";
import { stampValueFromEsignDateInput, toEsignDateTimeLocalInput } from "@/lib/esign/datetime";

/** Fields the signer fills in the guided UI (excludes per-page paraph copies). */
export function signableFieldLayout(layout: EsignFieldLayoutItem[]): EsignFieldLayoutItem[] {
  return layout.filter((f) => !f.derivedFrom?.trim());
}

/** Copy primary signature values onto derived per-page paraph fields before stamping. */
export function expandDerivedFieldValues(
  layout: EsignFieldLayoutItem[],
  values: FieldValueMap,
): FieldValueMap {
  const expanded = { ...values };
  for (const field of layout) {
    const sourceId = field.derivedFrom?.trim();
    if (!sourceId) continue;
    const source = values[sourceId];
    if (!source?.value?.trim()) continue;
    expanded[field.id] = { type: field.type, value: source.value };
  }
  return expanded;
}

function fieldLooksLikeSignerName(field: EsignFieldLayoutItem): boolean {
  const id = field.id.toLowerCase();
  const label = (field.label ?? "").toLowerCase();
  return id.includes("name") || label.includes("name");
}

/** Pre-fill hirer name and signing date/time before the guided walkthrough starts. */
export function buildSignerPrefillValues(
  layout: EsignFieldLayoutItem[],
  options?: { signerName?: string; signedAt?: Date },
): FieldValueMap {
  const signedAt = options?.signedAt ?? new Date();
  const dateValue = stampValueFromEsignDateInput(toEsignDateTimeLocalInput(signedAt), signedAt);
  const values: FieldValueMap = {};

  for (const field of signableFieldLayout(layout)) {
    if (field.type === "date") {
      values[field.id] = { type: "date", value: dateValue };
      continue;
    }
    if (field.type === "text" && options?.signerName?.trim() && fieldLooksLikeSignerName(field)) {
      values[field.id] = { type: "text", value: options.signerName.trim() };
    }
  }

  return values;
}
