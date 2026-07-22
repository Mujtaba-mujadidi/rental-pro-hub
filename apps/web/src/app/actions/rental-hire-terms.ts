"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canManageSettings } from "@/lib/auth/rental-permissions";
import { hashTermsBody } from "@/lib/contract-terms/hash";
import type { TermsVersionRow } from "@/lib/contract-terms/types";
import { createClient } from "@/lib/supabase/server";

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

async function requireCompanyHireTermsAdmin() {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) throw new Error(writable.error);
  if (!canManageSettings(profile)) throw new Error("You do not have permission to manage hire terms.");
  const companyId = profile.company_id?.trim();
  if (!companyId) throw new Error("No active company.");
  return { profile, companyId };
}

type AdminClient = Awaited<ReturnType<typeof createClient>>;

async function replacePublishedForCompany(
  supabase: AdminClient,
  parentCompanyId: string,
  publishedByUserId: string,
  versionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error: archErr } = await supabase
    .from("company_hire_terms_versions")
    .update({ status: "archived" })
    .eq("parent_company_id", parentCompanyId)
    .eq("status", "published");
  if (archErr) return { ok: false, error: archErr.message };

  const { error: pubErr } = await supabase
    .from("company_hire_terms_versions")
    .update({
      status: "published",
      published_at: now,
      published_by: publishedByUserId,
    })
    .eq("id", versionId);
  if (pubErr) return { ok: false, error: pubErr.message };

  return { ok: true };
}

export async function listCompanyHireTermsAction(): Promise<
  { ok: true; rows: TermsVersionRow[]; canManage: boolean } | { ok: false; error: string }
> {
  try {
    const { profile } = await requireRentalCompanyArea();
    const companyId = profile.company_id?.trim();
    if (!companyId) return { ok: false, error: "No active company." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("company_hire_terms_versions")
      .select("id, version_label, title, body, body_hash, status, published_at, created_at")
      .eq("parent_company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      rows: (data ?? []) as TermsVersionRow[],
      canManage: canManageSettings(profile),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export async function saveCompanyHireTermsDraftAction(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { profile, companyId } = await requireCompanyHireTermsAdmin();
    const id = nullIfEmpty(formData.get("id"));
    const versionLabel = nullIfEmpty(formData.get("version_label"));
    const title = nullIfEmpty(formData.get("title"));
    const body = nullIfEmpty(formData.get("body"));
    if (!versionLabel) return { ok: false, error: "Version label is required." };
    if (!title) return { ok: false, error: "Title is required." };
    if (!body) return { ok: false, error: "Body is required." };

    const supabase = await createClient();
    const hash = hashTermsBody(body);

    if (id) {
      const { data: existing, error: exErr } = await supabase
        .from("company_hire_terms_versions")
        .select("status")
        .eq("id", id)
        .eq("parent_company_id", companyId)
        .maybeSingle();
      if (exErr) return { ok: false, error: exErr.message };
      if (!existing || existing.status !== "draft") {
        return { ok: false, error: "Only draft versions can be edited." };
      }
      const { error } = await supabase
        .from("company_hire_terms_versions")
        .update({ version_label: versionLabel, title, body, body_hash: hash })
        .eq("id", id);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/rental/settings");
      return { ok: true, id };
    }

    const { data: inserted, error: insErr } = await supabase
      .from("company_hire_terms_versions")
      .insert({
        parent_company_id: companyId,
        version_label: versionLabel,
        title,
        body,
        body_hash: hash,
        status: "draft",
      })
      .select("id")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    if (!inserted?.id) return { ok: false, error: "Could not create draft." };

    revalidatePath("/rental/settings");
    return { ok: true, id: inserted.id as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export async function publishCompanyHireTermsVersionAction(
  versionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { profile, companyId } = await requireCompanyHireTermsAdmin();
    const trimmed = versionId?.trim();
    if (!trimmed) return { ok: false, error: "Missing version id." };

    const supabase = await createClient();
    const { data: row, error: rErr } = await supabase
      .from("company_hire_terms_versions")
      .select("id, status")
      .eq("id", trimmed)
      .eq("parent_company_id", companyId)
      .maybeSingle();
    if (rErr) return { ok: false, error: rErr.message };
    if (!row || row.status !== "draft") {
      return { ok: false, error: "Only a draft can be published." };
    }

    const promoted = await replacePublishedForCompany(supabase, companyId, profile.id, trimmed);
    if (!promoted.ok) return promoted;

    revalidatePath("/rental/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export async function republishArchivedCompanyHireTermsVersionAction(
  versionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { profile, companyId } = await requireCompanyHireTermsAdmin();
    const trimmed = versionId?.trim();
    if (!trimmed) return { ok: false, error: "Missing version id." };

    const supabase = await createClient();
    const { data: row, error: rErr } = await supabase
      .from("company_hire_terms_versions")
      .select("id, status")
      .eq("id", trimmed)
      .eq("parent_company_id", companyId)
      .maybeSingle();
    if (rErr) return { ok: false, error: rErr.message };
    if (!row || row.status !== "archived") {
      return { ok: false, error: "Only an archived version can be restored as active." };
    }

    const promoted = await replacePublishedForCompany(supabase, companyId, profile.id, trimmed);
    if (!promoted.ok) return promoted;

    revalidatePath("/rental/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export async function archiveCompanyHireTermsVersionAction(
  versionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireCompanyHireTermsAdmin();
    const trimmed = versionId?.trim();
    if (!trimmed) return { ok: false, error: "Missing version id." };

    const supabase = await createClient();
    const { data: row, error: rErr } = await supabase
      .from("company_hire_terms_versions")
      .select("id, status")
      .eq("id", trimmed)
      .maybeSingle();
    if (rErr) return { ok: false, error: rErr.message };
    if (!row || row.status !== "published") {
      return { ok: false, error: "Only a published version can be archived." };
    }

    const { error } = await supabase
      .from("company_hire_terms_versions")
      .update({ status: "archived" })
      .eq("id", trimmed);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/rental/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}
