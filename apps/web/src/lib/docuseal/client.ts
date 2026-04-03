import { getDocusealApiBaseUrl, getDocusealApiKey } from "@/lib/docuseal/config";

export type DocusealSubmitter = {
  role: string;
  email: string;
  name?: string;
  phone?: string;
  external_id?: string;
};

export type CreateSubmissionInput = {
  template_id: number;
  send_email?: boolean;
  name?: string;
  submitters: DocusealSubmitter[];
  metadata?: Record<string, unknown>;
};

export type CreateSubmissionResult =
  | { ok: true; submissionId: number; raw: unknown }
  | { ok: false; error: string };

export async function docusealCreateSubmission(input: CreateSubmissionInput): Promise<CreateSubmissionResult> {
  const key = getDocusealApiKey();
  if (!key) {
    return { ok: false, error: "DOCUSEAL_API_KEY is not configured." };
  }
  const base = getDocusealApiBaseUrl();
  const body: Record<string, unknown> = {
    template_id: input.template_id,
    send_email: input.send_email ?? true,
    submitters: input.submitters.map((s) => ({
      role: s.role,
      email: s.email,
      ...(s.name ? { name: s.name } : {}),
      ...(s.phone ? { phone: s.phone } : {}),
      ...(s.external_id ? { external_id: s.external_id } : {}),
    })),
  };
  if (input.name) body.name = input.name;
  if (input.metadata) body.metadata = input.metadata;

  let res: Response;
  try {
    res = await fetch(`${base}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": key,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "DocuSeal request failed." };
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, error: `DocuSeal invalid JSON (${res.status})` };
  }

  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error" in json
        ? String((json as { error: unknown }).error)
        : text || res.statusText;
    return { ok: false, error: msg || `DocuSeal HTTP ${res.status}` };
  }

  const o = json as { id?: number; submission_id?: number };
  const submissionId = typeof o.id === "number" ? o.id : typeof o.submission_id === "number" ? o.submission_id : NaN;
  if (!Number.isFinite(submissionId)) {
    return { ok: false, error: "DocuSeal response missing submission id." };
  }
  return { ok: true, submissionId, raw: json };
}
