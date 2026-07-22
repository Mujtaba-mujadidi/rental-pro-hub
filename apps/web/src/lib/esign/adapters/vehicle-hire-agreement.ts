import DOMPurify from "isomorphic-dompurify";
import { createEnvelopeFromPdf } from "@/lib/esign/envelope";
import {
  createProfessionalContractPdf,
  type ContractPdfInput,
} from "@/lib/esign/pdf-generate";
import { ESIGN_BUCKET, ESIGN_RECIPIENT_ROLE, type EsignFieldLayoutItem } from "@/lib/esign/types";
import { loadCompanyLogoForContractPdf } from "@/lib/companies/company-logo";
import {
  allAgreementsSigned,
  hireGroupStatusAfterAllSigned,
  vehicleStatusForHireGroup,
} from "@/lib/fleet/hire-lifecycle";
import { syncVehicleStatusForHireGroup } from "@/lib/fleet/sync-vehicle-hire-status";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import { touchHireGroupForEnvelopeRealtime, touchHireGroupRealtime } from "@/lib/esign/touch-hire-group-realtime";
import type { ContractLengthKind, RentCadence } from "@/lib/fleet/hire-types";
import { buildHirePdfDetails, type HirePdfDriverSource, type HirePdfVehicleSource } from "@/lib/fleet/hire-pdf-details";
import { persistHireTimesheetForGroup } from "@/lib/fleet/persist-hire-timesheet";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const VEHICLE_HIRE_AGREEMENT_CONTEXT = "vehicle_hire_agreement" as const;

const LENGTH_LABELS: Record<ContractLengthKind, string> = {
  annual: "Annual",
  six_months: "6 months",
  custom: "Custom",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bodyToHtmlFragment(body: string): string {
  const t = body?.trim() ?? "";
  if (!t) return "<p><em>(No hire terms configured.)</em></p>";
  if (/<[a-z][\s\S]*>/i.test(t)) return t;
  const paras = t.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return paras.join("") || "<p><em>(Empty terms.)</em></p>";
}

function termsToParagraphs(bodyRaw: string): string[] {
  const safe = DOMPurify.sanitize(bodyToHtmlFragment(bodyRaw), {
    ALLOWED_TAGS: ["p", "br", "b", "i", "u", "strong", "em", "ul", "ol", "li", "a", "span", "div", "h1", "h2", "h3"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
  const withMarkers = safe
    .replace(/<\/h[1-3]>/gi, "\n\n")
    .replace(/<h[1-3][^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/?(ul|ol|div|span)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  return withMarkers
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const HIRE_AGREEMENT_GROUP_SELECT =
  "id, parent_company_id, subcompany_id, driver_user_id, start_date, rent_cadence, rent_amount_gbp, deposit_gbp, subcompany_legal_snapshot, hire_terms_version_id, default_payment_account_id, vehicles(vrm, make, model, colour, cc, fuel_type)";

const HIRE_DRIVER_PROFILE_SELECT =
  "first_name, last_name, account_email, date_of_birth, phone, address_line1, address_line2, address_town, address_county, address_postcode, driving_licence_number, driving_licence_expiry, phv_licence_number";

async function loadHireAgreementPdfInput(
  admin: Admin,
  agreement: {
    contract_length_kind: string;
    end_date: string;
    vehicle_hire_groups?: Record<string, unknown> | null;
  },
  options?: { signatureMode?: "recipient_only" | "owner_and_recipient" },
): Promise<
  | { ok: true; pdfInput: ContractPdfInput; companyId: string; driverEmail: string; driverName: string }
  | { ok: false; error: string }
> {
  const group = agreement.vehicle_hire_groups;
  if (!group?.id) return { ok: false, error: "Hire group not found." };

  const vehicle = (group.vehicles ?? {}) as HirePdfVehicleSource;
  const companyId = group.parent_company_id as string;
  const driverUserId = group.driver_user_id as string;

  const [{ data: company }, { data: driver }, { data: terms }, resolvedPermission] = await Promise.all([
    admin
      .from("companies")
      .select("name, company_number, primary_contact_email, primary_contact_phone")
      .eq("id", companyId)
      .maybeSingle(),
    admin.from("driver_profiles").select(HIRE_DRIVER_PROFILE_SELECT).eq("user_id", driverUserId).maybeSingle(),
    group.hire_terms_version_id
      ? admin
          .from("company_hire_terms_versions")
          .select("body")
          .eq("id", group.hire_terms_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    resolvePermissionLetterForHirePdf(admin, companyId),
  ]);

  if (!driver?.account_email?.trim()) {
    return { ok: false, error: "Driver email is required for e-sign." };
  }

  let bankPayee: string | null = null;
  let bankSortCode: string | null = null;
  let bankAccountNumber: string | null = null;
  let bankReferenceHint: string | null = null;
  if (group.default_payment_account_id) {
    const { data: acct } = await admin
      .from("company_payment_accounts")
      .select("payee_name, sort_code, account_number, payment_reference_hint, show_to_hirer")
      .eq("id", group.default_payment_account_id)
      .maybeSingle();
    if (acct?.show_to_hirer) {
      bankPayee = acct.payee_name;
      bankSortCode = acct.sort_code;
      bankAccountNumber = acct.account_number;
      bankReferenceHint = acct.payment_reference_hint;
    }
  }

  const legalSnap = (group.subcompany_legal_snapshot ?? {}) as Record<string, unknown>;
  const subcompanyLegalName = (legalSnap.legal_name as string) || company?.name || "Lessor";
  const subcompanyAddress = (legalSnap.address as string) || null;
  const companyNumber = ((legalSnap.company_number as string) || company?.company_number || "").trim() || null;
  const contactEmail = (company?.primary_contact_email as string | null)?.trim() || null;
  const contactPhone = (company?.primary_contact_phone as string | null)?.trim() || null;
  const driverName =
    [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.account_email;

  const pdfInput = buildHireAgreementPdfInput({
    companyName: company?.name ?? "Rental company",
    subcompanyLegalName,
    subcompanyAddress,
    driverName,
    driverEmail: driver.account_email.trim(),
    driver: driver as HirePdfDriverSource,
    vehicle,
    startDate: group.start_date as string,
    endDate: agreement.end_date as string,
    contractLengthKind: agreement.contract_length_kind as ContractLengthKind,
    rentCadence: group.rent_cadence as RentCadence,
    rentAmountGbp: Number(group.rent_amount_gbp),
    depositGbp: group.deposit_gbp != null ? Number(group.deposit_gbp) : null,
    termsBody: terms?.body ?? "",
    permissionTitle: resolvedPermission?.title ?? "Permission letter",
    permissionBody: resolvedPermission?.body ?? "",
    companyNumber,
    contactEmail,
    contactPhone,
    signatureMode: options?.signatureMode,
    bankPayee,
    bankSortCode,
    bankAccountNumber,
    bankReferenceHint,
  });

  const logo = await loadCompanyLogoForContractPdf(admin, companyId);
  if (logo) {
    pdfInput.logoBytes = logo.bytes;
    pdfInput.logoContentType = logo.contentType;
  }

  return { ok: true, pdfInput, companyId, driverEmail: driver.account_email.trim(), driverName };
}

async function resolvePermissionLetterForHirePdf(
  admin: Admin,
  companyId: string,
): Promise<{ title: string; body: string } | null> {
  const { data: perm } = await admin
    .from("company_hire_permission_letter_versions")
    .select("title, body")
    .eq("parent_company_id", companyId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const publishedBody = perm?.body?.trim();
  if (!publishedBody || !perm) return null;

  return {
    title: (perm.title as string)?.trim() || "Permission letter",
    body: publishedBody,
  };
}

export function buildHireAgreementPdfInput(input: {
  companyName: string;
  subcompanyLegalName: string;
  subcompanyAddress: string | null;
  driverName: string;
  driverEmail: string;
  driver: HirePdfDriverSource;
  vehicle: HirePdfVehicleSource;
  startDate: string;
  endDate: string;
  contractLengthKind: ContractLengthKind;
  rentCadence: RentCadence;
  rentAmountGbp: number;
  depositGbp: number | null;
  termsBody: string;
  permissionTitle?: string;
  permissionBody?: string;
  companyNumber?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  signatureMode?: "recipient_only" | "owner_and_recipient";
  bankPayee?: string | null;
  bankSortCode?: string | null;
  bankAccountNumber?: string | null;
  bankReferenceHint?: string | null;
}): ContractPdfInput {
  const { hireDetails, hireRunningHeader } = buildHirePdfDetails({
    driver: input.driver,
    driverName: input.driverName,
    driverEmail: input.driverEmail,
    vehicle: input.vehicle,
    startDate: input.startDate,
    endDate: input.endDate,
    contractLengthKind: input.contractLengthKind,
    rentCadence: input.rentCadence,
    rentAmountGbp: input.rentAmountGbp,
    depositGbp: input.depositGbp,
  });

  return {
    title: `Vehicle hire agreement — ${input.vehicle.vrm ?? "Vehicle"}`,
    subtitle: LENGTH_LABELS[input.contractLengthKind],
    documentLabel: "Vehicle hire agreement",
    issuedAt: new Date(),
    platformName: input.companyName,
    parties: [],
    commercialRows: [],
    hireDetails,
    hireRunningHeader,
    termsHeading: "Terms and Conditions",
    termsParagraphs: termsToParagraphs(input.termsBody),
    permissionHeading: input.permissionTitle || "Permission letter",
    permissionParagraphs: input.permissionBody?.trim() ? termsToParagraphs(input.permissionBody) : undefined,
    companyNumber: input.companyNumber,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    acceptanceText:
      "By signing, the hirer confirms they have read and agree to this vehicle hire agreement, permission letter, and terms and conditions above.",
    signatureMode: input.signatureMode ?? "owner_and_recipient",
  };
}

export async function prepareVehicleHireAgreementEnvelope(
  admin: Admin,
  agreementId: string,
  createdBy?: string | null,
): Promise<{ ok: true; envelopeId: string } | { ok: false; error: string }> {
  const { data: agreement, error: aErr } = await admin
    .from("vehicle_hire_agreements")
    .select(`id, hire_group_id, contract_length_kind, end_date, status, esign_envelope_id, vehicle_hire_groups(${HIRE_AGREEMENT_GROUP_SELECT})`)
    .eq("id", agreementId)
    .maybeSingle();
  if (aErr || !agreement?.id) return { ok: false, error: aErr?.message ?? "Agreement not found." };
  if (agreement.status !== "draft") {
    return { ok: false, error: "Only draft agreements can be prepared for e-sign." };
  }
  if (agreement.esign_envelope_id) {
    return { ok: true, envelopeId: agreement.esign_envelope_id as string };
  }

  const group = (agreement as unknown as { vehicle_hire_groups?: Record<string, unknown> | null }).vehicle_hire_groups;
  if (!group?.id) return { ok: false, error: "Hire group not found." };

  const loaded = await loadHireAgreementPdfInput(
    admin,
    agreement as unknown as Parameters<typeof loadHireAgreementPdfInput>[1],
  );
  if (!loaded.ok) return loaded;
  const { pdfInput, companyId, driverEmail, driverName } = loaded;

  const rendered = await createProfessionalContractPdf(pdfInput);
  const created = await createEnvelopeFromPdf(admin, {
    contextType: VEHICLE_HIRE_AGREEMENT_CONTEXT,
    contextId: agreement.id as string,
    parentCompanyId: companyId,
    title: pdfInput.title,
    pdfBytes: rendered.bytes,
    suggestedFields: rendered.suggestedFields,
    requiresOwnerSignature: true,
    recipients: [
      {
        email: driverEmail,
        name: driverName,
        role: ESIGN_RECIPIENT_ROLE,
      },
    ],
    createdBy: createdBy ?? null,
  });
  if (!created.ok) return created;

  await admin
    .from("vehicle_hire_agreements")
    .update({ esign_envelope_id: created.envelopeId, status: "pending_signature" })
    .eq("id", agreement.id);

  await admin
    .from("vehicle_hire_groups")
    .update({ status: "pending_signature" })
    .eq("id", group.id);

  await syncVehicleStatusForHireGroup(admin, group.id as string);

  await logHireGroupEvent(admin, {
    hireGroupId: group.id as string,
    eventType: "esign_prepared",
    summary: "Hire agreement prepared for e-signature.",
    actorRole: "company_staff",
    actorUserId: createdBy ?? null,
    metadata: { agreement_id: agreementId, envelope_id: created.envelopeId },
  });

  return { ok: true, envelopeId: created.envelopeId };
}

/** Rebuild hire agreement PDF from latest data (terms, permission letter, driver/vehicle). */
export async function refreshHireEnvelopePdf(
  admin: Admin,
  envelopeId: string,
): Promise<{ ok: true; suggestedFields: EsignFieldLayoutItem[] } | { ok: false; error: string }> {
  const { data: env, error: envErr } = await admin
    .from("esign_envelopes")
    .select("id, context_type, context_id, unsigned_pdf_path, owner_signed_at, status, requires_owner_signature")
    .eq("id", envelopeId)
    .maybeSingle();
  if (envErr || !env?.id) return { ok: false, error: envErr?.message ?? "Envelope not found." };
  if (env.context_type !== VEHICLE_HIRE_AGREEMENT_CONTEXT || !env.context_id) {
    return { ok: false, error: "Not a vehicle hire agreement envelope." };
  }
  if (env.owner_signed_at || env.status === "sent" || env.status === "viewed" || env.status === "completed") {
    return { ok: false, error: "PDF cannot be regenerated after the contract has been sent or signed." };
  }

  const mode: "recipient_only" | "owner_and_recipient" =
    env.requires_owner_signature === true ? "owner_and_recipient" : "recipient_only";
  return regenerateHireEnvelopePdfForSignatureMode(admin, envelopeId, mode);
}

/** Rebuild hire agreement PDF when signature mode changes in the designer. */
export async function regenerateHireEnvelopePdfForSignatureMode(
  admin: Admin,
  envelopeId: string,
  mode: "recipient_only" | "owner_and_recipient",
): Promise<{ ok: true; suggestedFields: EsignFieldLayoutItem[] } | { ok: false; error: string }> {
  const { data: env, error: envErr } = await admin
    .from("esign_envelopes")
    .select("id, context_type, context_id, unsigned_pdf_path, owner_signed_at, status")
    .eq("id", envelopeId)
    .maybeSingle();
  if (envErr || !env?.id) return { ok: false, error: envErr?.message ?? "Envelope not found." };
  if (env.context_type !== VEHICLE_HIRE_AGREEMENT_CONTEXT || !env.context_id) {
    return { ok: false, error: "Not a vehicle hire agreement envelope." };
  }
  if (env.owner_signed_at || env.status === "sent" || env.status === "viewed" || env.status === "completed") {
    return { ok: false, error: "Signature mode can no longer be changed." };
  }

  const { data: agreement, error: aErr } = await admin
    .from("vehicle_hire_agreements")
    .select(`id, hire_group_id, contract_length_kind, end_date, vehicle_hire_groups(${HIRE_AGREEMENT_GROUP_SELECT})`)
    .eq("id", env.context_id)
    .maybeSingle();
  if (aErr || !agreement?.id) return { ok: false, error: aErr?.message ?? "Agreement not found." };

  const loaded = await loadHireAgreementPdfInput(
    admin,
    agreement as unknown as Parameters<typeof loadHireAgreementPdfInput>[1],
    {
      signatureMode: mode,
    },
  );
  if (!loaded.ok) return loaded;
  const { pdfInput } = loaded;

  const rendered = await createProfessionalContractPdf(pdfInput);
  const path = (env.unsigned_pdf_path as string) || `${envelopeId}/unsigned.pdf`;
  const { error: upErr } = await admin.storage.from(ESIGN_BUCKET).upload(path, rendered.bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) return { ok: false, error: `PDF update failed: ${upErr.message}` };

  await admin
    .from("esign_envelopes")
    .update({
      unsigned_pdf_path: path,
      suggested_field_layout: rendered.suggestedFields,
      requires_owner_signature: mode === "owner_and_recipient",
      field_values: {},
      owner_signed_at: null,
    })
    .eq("id", envelopeId);

  await touchHireGroupForEnvelopeRealtime(admin, envelopeId);

  return { ok: true, suggestedFields: rendered.suggestedFields };
}

async function refreshHireGroupAfterAgreementSigned(admin: Admin, hireGroupId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("id, vehicle_id, start_date, status, vehicle_hire_agreements(status, signed_at)")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (!group?.id) return;

  const agreements = ((group as { vehicle_hire_agreements?: { status: string; signed_at: string | null }[] })
    .vehicle_hire_agreements ?? []) as { status: string; signed_at: string | null }[];

  const signedFlags = agreements.map(
    (a) => Boolean(a.signed_at) || a.status === "reserved" || a.status === "active",
  );
  if (!allAgreementsSigned(signedFlags)) return;

  const nextStatus = hireGroupStatusAfterAllSigned(group.start_date as string, today);
  const now = new Date().toISOString();
  await admin
    .from("vehicle_hire_groups")
    .update({
      status: nextStatus,
      activated_at: nextStatus === "active" ? now : null,
    })
    .eq("id", hireGroupId);

  const vehicleStatus = vehicleStatusForHireGroup(nextStatus);
  if (vehicleStatus) {
    await admin.from("vehicles").update({ status: vehicleStatus }).eq("id", group.vehicle_id);
  }

  await persistHireTimesheetForGroup(admin, hireGroupId);

  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "hire_status_changed",
    summary: `All agreements signed — hire status set to ${nextStatus}.`,
    actorRole: "system",
    metadata: { status: nextStatus },
  });
}

export async function onVehicleHireAgreementOwnerSigned(
  admin: Admin,
  envelope: { id: string; context_type: string },
): Promise<void> {
  if (envelope.context_type !== VEHICLE_HIRE_AGREEMENT_CONTEXT) return;
  await touchHireGroupForEnvelopeRealtime(admin, envelope.id);
}

export async function onVehicleHireAgreementSigned(
  admin: Admin,
  envelope: {
    id: string;
    context_type: string;
    context_id: string;
    parent_company_id: string | null;
  },
): Promise<void> {
  if (envelope.context_type !== VEHICLE_HIRE_AGREEMENT_CONTEXT) return;

  const { data: envRow } = await admin
    .from("esign_envelopes")
    .select("signed_pdf_path")
    .eq("id", envelope.id)
    .maybeSingle();

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const { data: agreement } = await admin
    .from("vehicle_hire_agreements")
    .select("id, hire_group_id, vehicle_hire_groups(start_date)")
    .eq("id", envelope.context_id)
    .maybeSingle();
  if (!agreement?.id) return;

  const startDate = (
    (agreement as { vehicle_hire_groups?: { start_date?: string } | null }).vehicle_hire_groups?.start_date ?? today
  ) as string;
  const agreementStatus = hireGroupStatusAfterAllSigned(startDate, today);

  await admin
    .from("vehicle_hire_agreements")
    .update({
      status: agreementStatus,
      signed_at: now,
      signed_storage_path: envRow?.signed_pdf_path ?? null,
    })
    .eq("id", agreement.id);

  // Bump hire group so company contract lists refresh via Supabase Realtime.
  await touchHireGroupRealtime(admin, agreement.hire_group_id as string);

  await refreshHireGroupAfterAgreementSigned(admin, agreement.hire_group_id as string);
}
