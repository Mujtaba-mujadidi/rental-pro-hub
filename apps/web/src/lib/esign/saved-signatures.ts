import { createHash } from "crypto";
import { ESIGN_BUCKET } from "@/lib/esign/types";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function parseDataUrl(dataUrl: string): { bytes: Buffer; contentType: string } | null {
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) return null;
  return { contentType: m[1]!, bytes: Buffer.from(m[2]!, "base64") };
}

function emailStorageKey(email: string): string {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `signatures/emails/${hash}.png`;
}

function userStorageKey(userId: string): string {
  return `signatures/users/${userId}.png`;
}

export async function getSavedSignatureForUser(
  admin: Admin,
  userId: string,
): Promise<{ ok: true; dataUrl: string } | { ok: false }> {
  const { data } = await admin
    .from("esign_saved_signatures")
    .select("storage_path")
    .eq("party_type", "user")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.storage_path) return { ok: false };
  const { data: blob, error } = await admin.storage.from(ESIGN_BUCKET).download(data.storage_path as string);
  if (error || !blob) return { ok: false };
  const buf = Buffer.from(await blob.arrayBuffer());
  return { ok: true, dataUrl: `data:image/png;base64,${buf.toString("base64")}` };
}

export async function getSavedSignatureForEmail(
  admin: Admin,
  email: string,
): Promise<{ ok: true; dataUrl: string } | { ok: false }> {
  const normalized = email.trim().toLowerCase();
  const { data } = await admin
    .from("esign_saved_signatures")
    .select("storage_path")
    .eq("party_type", "email")
    .eq("email", normalized)
    .maybeSingle();
  if (!data?.storage_path) return { ok: false };
  const { data: blob, error } = await admin.storage.from(ESIGN_BUCKET).download(data.storage_path as string);
  if (error || !blob) return { ok: false };
  const buf = Buffer.from(await blob.arrayBuffer());
  return { ok: true, dataUrl: `data:image/png;base64,${buf.toString("base64")}` };
}

export async function saveSignatureForUser(
  admin: Admin,
  userId: string,
  dataUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { ok: false, error: "Invalid signature image." };
  const path = userStorageKey(userId);
  const { error: upErr } = await admin.storage.from(ESIGN_BUCKET).upload(path, parsed.bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: existing } = await admin
    .from("esign_saved_signatures")
    .select("id")
    .eq("party_type", "user")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("esign_saved_signatures")
      .update({ storage_path: path })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("esign_saved_signatures").insert({
      party_type: "user",
      user_id: userId,
      storage_path: path,
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function saveSignatureForEmail(
  admin: Admin,
  email: string,
  dataUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { ok: false, error: "Invalid signature image." };
  const path = emailStorageKey(normalized);
  const { error: upErr } = await admin.storage.from(ESIGN_BUCKET).upload(path, parsed.bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: existing } = await admin
    .from("esign_saved_signatures")
    .select("id")
    .eq("party_type", "email")
    .eq("email", normalized)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("esign_saved_signatures")
      .update({ storage_path: path })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("esign_saved_signatures").insert({
      party_type: "email",
      email: normalized,
      storage_path: path,
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
