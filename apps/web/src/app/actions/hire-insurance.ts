"use server";

import { revalidatePath } from "next/cache";
import { assertDriverLinkedToCompany } from "@/app/actions/rental-driver-links";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import { ukTodayYmd } from "@/lib/datetime/uk";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import {
  canPartyUploadHireInsurance,
  HIRE_INSURANCE_TYPE_LABELS,
  isHireInsuranceProvidedBy,
  isHireInsuranceType,
  mapHireInsuranceSummary,
  parseHireInsuranceExpiryYmd,
} from "@/lib/fleet/hire-insurance";
import { prepareVehicleDocumentPdf } from "@/lib/fleet/vehicle-document-pdf";
import { parseCompanyNotificationSettings } from "@/lib/settings/notification-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "hire-insurance-documents";

export type HireInsuranceSummary = ReturnType<typeof mapHireInsuranceSummary>;

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function revalidateHireInsurancePaths(hireGroupId: string) {
  revalidatePath(`/rental/hires/${hireGroupId}`);
  revalidatePath(`/rental/hires/${hireGroupId}/details`);
  revalidatePath(`/driver/hires/${hireGroupId}`);
  revalidatePath(`/driver/hires/${hireGroupId}/details`);
}

async function loadHireInsuranceAuth(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      group: {
        id: string;
        parent_company_id: string;
        driver_user_id: string;
        insurance_provided_by: string | null;
        status: string;
      };
      userId: string;
    }
  | { ok: false; error: string }
> {
  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Missing hire." };

  const supabase = await createClient();

  if (audience === "staff") {
    const { profile } = await requireRentalCompanyArea();
    if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
    const { data: group, error } = await supabase
      .from("vehicle_hire_groups")
      .select("id, parent_company_id, driver_user_id, insurance_provided_by, status")
      .eq("id", id)
      .eq("parent_company_id", profile.company_id ?? "")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!group) return { ok: false, error: "Hire not found." };
    return { ok: true, supabase, group, userId: profile.id };
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, driver_user_id, insurance_provided_by, status")
    .eq("id", id)
    .eq("driver_user_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group) return { ok: false, error: "Hire not found." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }
  const linked = await assertDriverLinkedToCompany(
    admin,
    group.parent_company_id as string,
    user.id,
  );
  if (!linked.ok) return linked;

  return { ok: true, supabase, group, userId: user.id };
}

export async function loadHireInsuranceSummaryAction(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<ActionResult<HireInsuranceSummary>> {
  const access = await loadHireInsuranceAuth(hireGroupId, audience);
  if (!access.ok) return access;

  const [{ data: company }, { data: insurance }] = await Promise.all([
    access.supabase
      .from("companies")
      .select("notify_insurance_days_before")
      .eq("id", access.group.parent_company_id)
      .maybeSingle(),
    access.supabase
      .from("vehicle_hire_insurance")
      .select("insurance_type, expiry_date, file_name, uploaded_at, uploaded_by_role")
      .eq("hire_group_id", access.group.id)
      .maybeSingle(),
  ]);

  const notify = parseCompanyNotificationSettings(company ?? undefined);
  return {
    ok: true,
    data: mapHireInsuranceSummary({
      providedBy: access.group.insurance_provided_by,
      insuranceRow: insurance,
      notifyDaysBefore: notify.notify_insurance_days_before,
      audience,
      todayYmd: ukTodayYmd(),
    }),
  };
}

export async function uploadHireInsuranceDocumentAction(
  formData: FormData,
): Promise<ActionResult<null>> {
  const hireGroupId = String(formData.get("hire_group_id") ?? "").trim();
  const audienceRaw = String(formData.get("audience") ?? "staff");
  const audience = audienceRaw === "driver" ? "driver" : "staff";
  const insuranceTypeRaw = String(formData.get("insurance_type") ?? "").trim();
  const expiryRaw = String(formData.get("expiry_date") ?? "").trim();

  if (!hireGroupId) return { ok: false, error: "Missing hire." };
  if (!isHireInsuranceType(insuranceTypeRaw)) {
    return { ok: false, error: "Select an insurance type." };
  }
  const expiryParsed = parseHireInsuranceExpiryYmd(expiryRaw);
  if (!expiryParsed.ok) return expiryParsed;

  const access = await loadHireInsuranceAuth(hireGroupId, audience);
  if (!access.ok) return access;

  if (audience === "staff") {
    const { profile } = await requireRentalCompanyArea();
    const writable = await assertRentalCompanyWritable(profile);
    if (!writable.ok) return writable;
    if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };
  }

  const providedByRaw = access.group.insurance_provided_by;
  const providedBy =
    providedByRaw && isHireInsuranceProvidedBy(providedByRaw) ? providedByRaw : null;
  if (!providedBy) {
    return { ok: false, error: "Insurance responsibility is not set for this hire." };
  }
  if (!canPartyUploadHireInsurance({ providedBy, audience })) {
    return {
      ok: false,
      error:
        providedBy === "driver"
          ? "The driver must upload insurance for this hire."
          : "Your rental company will upload fleet insurance for this hire.",
    };
  }

  const files: File[] = [];
  for (const entry of formData.getAll("files")) {
    if (entry instanceof File && entry.size > 0) files.push(entry);
  }
  const single = formData.get("file");
  if (single instanceof File && single.size > 0) files.push(single);
  if (!files.length) return { ok: false, error: "Choose a PDF or one or more images." };

  const MAX_INPUT = 12 * 1024 * 1024;
  for (const file of files) {
    if (file.size > MAX_INPUT) {
      return { ok: false, error: `${file.name || "A file"} is over 12 MB before compression.` };
    }
    const allowed = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!allowed) return { ok: false, error: "Use a PDF or images (JPEG, PNG, WebP)." };
  }

  const filePayloads = await Promise.all(
    files.map(async (file) => ({
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
      fileName: file.name || "upload",
    })),
  );

  const prepared = await prepareVehicleDocumentPdf(filePayloads, "Hire insurance certificate");
  if (!prepared.ok) return prepared;

  const parentCompanyId = access.group.parent_company_id as string;
  const path = `${parentCompanyId}/${hireGroupId}/${prepared.pdf.fileName}`;

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: existing } = await admin
    .from("vehicle_hire_insurance")
    .select("file_path")
    .eq("hire_group_id", hireGroupId)
    .maybeSingle();
  if (existing?.file_path) {
    await admin.storage.from(BUCKET).remove([existing.file_path]);
  }

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, prepared.pdf.bytes, {
    contentType: prepared.pdf.contentType,
    upsert: true,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const now = new Date().toISOString();
  const uploadedByRole = audience === "driver" ? "driver" : "company_staff";
  const row = {
    hire_group_id: hireGroupId,
    parent_company_id: parentCompanyId,
    insurance_type: insuranceTypeRaw,
    expiry_date: expiryParsed.value,
    file_path: path,
    file_name: prepared.pdf.fileName,
    content_type: prepared.pdf.contentType,
    uploaded_by_user_id: access.userId,
    uploaded_by_role: uploadedByRole,
    uploaded_at: now,
  };

  const { error: insErr } = await admin.from("vehicle_hire_insurance").upsert(row);
  if (insErr) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: insErr.message };
  }

  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "hire_status_changed",
    summary: `Hire insurance certificate uploaded (${HIRE_INSURANCE_TYPE_LABELS[insuranceTypeRaw]}).`,
    actorRole: audience === "driver" ? "driver" : "company_staff",
    actorUserId: access.userId,
    metadata: { insurance_type: insuranceTypeRaw, expiry_date: expiryParsed.value },
  });

  revalidateHireInsurancePaths(hireGroupId);
  return { ok: true, data: null };
}

export async function getHireInsuranceDocumentUrlAction(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<ActionResult<{ url: string; fileName: string }>> {
  const access = await loadHireInsuranceAuth(hireGroupId, audience);
  if (!access.ok) return access;

  const { data: insurance, error } = await access.supabase
    .from("vehicle_hire_insurance")
    .select("file_path, file_name")
    .eq("hire_group_id", hireGroupId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!insurance?.file_path) return { ok: false, error: "Insurance certificate not uploaded yet." };

  const { data: signed, error: signErr } = await access.supabase.storage
    .from(BUCKET)
    .createSignedUrl(insurance.file_path, 3600);
  if (signErr || !signed?.signedUrl) {
    return { ok: false, error: signErr?.message ?? "Could not open document." };
  }

  return {
    ok: true,
    data: {
      url: signed.signedUrl,
      fileName: (insurance.file_name as string | null) ?? "hire-insurance.pdf",
    },
  };
}
