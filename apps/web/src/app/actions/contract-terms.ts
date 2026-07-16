"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { hashTermsBody } from "@/lib/contract-terms/hash";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export type ContractTermsVersionRow = {
  id: string;
  family: string;
  version_label: string;
  title: string;
  body: string;
  body_hash: string;
  status: string;
  published_at: string | null;
  created_at: string;
};

export async function listPublishedTermsForRegisterAction(): Promise<
  { ok: true; versions: { id: string; version_label: string; title: string }[] } | { ok: false; error: string }
> {
  try {
    await requireSuperAdmin();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("contract_terms_versions")
      .select("id, version_label, title")
      .eq("status", "published")
      .eq("family", "rental_master")
      .order("published_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, versions: (data ?? []) as { id: string; version_label: string; title: string }[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Full body for super-admin review when picking T&amp;C on register company (published + rental_master only). */
export async function getPublishedTermsVersionBodyForReviewAction(
  versionId: string,
): Promise<
  { ok: true; version_label: string; title: string; body: string } | { ok: false; error: string }
> {
  const id = versionId?.trim();
  if (!id) return { ok: false, error: "Missing terms version." };
  try {
    await requireSuperAdmin();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("contract_terms_versions")
      .select("version_label, title, body")
      .eq("id", id)
      .eq("status", "published")
      .eq("family", "rental_master")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Terms not found or not published." };
    return {
      ok: true,
      version_label: data.version_label as string,
      title: data.title as string,
      body: typeof data.body === "string" ? data.body : "",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export async function listContractTermsAdminAction(): Promise<
  { ok: true; rows: ContractTermsVersionRow[] } | { ok: false; error: string }
> {
  try {
    await requireSuperAdmin();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("contract_terms_versions")
      .select("id, family, version_label, title, body, body_hash, status, published_at, created_at")
      .eq("family", "rental_master")
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: (data ?? []) as ContractTermsVersionRow[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export async function saveContractTermsDraftAction(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const id = nullIfEmpty(formData.get("id"));
  const versionLabel = nullIfEmpty(formData.get("version_label"));
  const title = nullIfEmpty(formData.get("title"));
  const body = nullIfEmpty(formData.get("body"));
  if (!versionLabel) return { ok: false, error: "Version label is required." };
  if (!title) return { ok: false, error: "Title is required." };
  if (!body) return { ok: false, error: "Body is required." };

  const admin = createSupabaseAdminClient();
  const hash = hashTermsBody(body);

  if (id) {
    const { data: existing, error: exErr } = await admin
      .from("contract_terms_versions")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (exErr) return { ok: false, error: exErr.message };
    if (!existing || existing.status !== "draft") {
      return { ok: false, error: "Only draft versions can be edited." };
    }
    const { error } = await admin
      .from("contract_terms_versions")
      .update({ version_label: versionLabel, title, body, body_hash: hash })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/super-admin/settings/contract-terms");
    return { ok: true, id };
  }

  const { data: inserted, error: insErr } = await admin
    .from("contract_terms_versions")
    .insert({
      family: "rental_master",
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

  revalidatePath("/super-admin/settings/contract-terms");
  return { ok: true, id: inserted.id as string };
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Archive current published row(s) in the family, then mark `versionId` as published. */
async function replacePublishedInFamily(
  admin: AdminClient,
  publishedByUserId: string,
  family: string,
  versionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error: archErr } = await admin
    .from("contract_terms_versions")
    .update({ status: "archived" })
    .eq("family", family)
    .eq("status", "published");
  if (archErr) return { ok: false, error: archErr.message };

  const { error: pubErr } = await admin
    .from("contract_terms_versions")
    .update({
      status: "published",
      published_at: now,
      published_by: publishedByUserId,
    })
    .eq("id", versionId);
  if (pubErr) return { ok: false, error: pubErr.message };

  return { ok: true };
}

export async function publishContractTermsVersionAction(
  versionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const trimmed = versionId?.trim();
  if (!trimmed) return { ok: false, error: "Missing version id." };

  const admin = createSupabaseAdminClient();
  const { data: row, error: rErr } = await admin
    .from("contract_terms_versions")
    .select("id, family, status")
    .eq("id", trimmed)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!row || row.status !== "draft") {
    return { ok: false, error: "Only a draft can be published." };
  }

  const promoted = await replacePublishedInFamily(admin, user.id, row.family as string, trimmed);
  if (!promoted.ok) return promoted;

  revalidatePath("/super-admin/settings/contract-terms");
  return { ok: true };
}

/** Restore an archived version as the active (published) catalog row for its family. */
export async function republishArchivedContractTermsVersionAction(
  versionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const trimmed = versionId?.trim();
  if (!trimmed) return { ok: false, error: "Missing version id." };

  const admin = createSupabaseAdminClient();
  const { data: row, error: rErr } = await admin
    .from("contract_terms_versions")
    .select("id, family, status")
    .eq("id", trimmed)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!row || row.status !== "archived") {
    return { ok: false, error: "Only an archived version can be restored as active." };
  }

  const promoted = await replacePublishedInFamily(admin, user.id, row.family as string, trimmed);
  if (!promoted.ok) return promoted;

  revalidatePath("/super-admin/settings/contract-terms");
  return { ok: true };
}

export async function archiveContractTermsVersionAction(
  versionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const trimmed = versionId?.trim();
  if (!trimmed) return { ok: false, error: "Missing version id." };

  const admin = createSupabaseAdminClient();
  const { data: row, error: rErr } = await admin
    .from("contract_terms_versions")
    .select("id, status")
    .eq("id", trimmed)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!row || row.status !== "published") {
    return { ok: false, error: "Only a published version can be archived." };
  }

  const { error } = await admin.from("contract_terms_versions").update({ status: "archived" }).eq("id", trimmed);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/super-admin/settings/contract-terms");
  return { ok: true };
}
