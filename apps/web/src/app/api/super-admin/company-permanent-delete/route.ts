import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/roles";
import { runPermanentCompanyPurgeWithProgress } from "@/lib/companies/permanent-company-purge";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

type Body = { companyId?: string; variant?: "offboarding_force" | "access_blocked" };

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        const supabase = await createClient();
        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();
        if (authErr || !user) {
          send({ error: "Unauthorized." });
          controller.close();
          return;
        }

        const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (!isSuperAdmin(user.email, prof)) {
          send({ error: "Forbidden." });
          controller.close();
          return;
        }

        let body: Body;
        try {
          body = (await req.json()) as Body;
        } catch {
          send({ error: "Invalid JSON body." });
          controller.close();
          return;
        }

        const companyId = body.companyId?.trim();
        const variant = body.variant;
        if (!companyId || (variant !== "offboarding_force" && variant !== "access_blocked")) {
          send({ error: "Missing companyId or invalid variant." });
          controller.close();
          return;
        }

        let admin: ReturnType<typeof createSupabaseAdminClient>;
        try {
          admin = createSupabaseAdminClient();
        } catch (e) {
          send({ error: e instanceof Error ? e.message : "Server configuration error." });
          controller.close();
          return;
        }

        const { data: company, error: getErr } = await admin
          .from("companies")
          .select("id, logo_storage_path, deletion_phase")
          .eq("id", companyId)
          .maybeSingle();
        if (getErr) {
          send({ error: getErr.message });
          controller.close();
          return;
        }
        if (!company?.id) {
          send({ error: "Company not found." });
          controller.close();
          return;
        }

        const phase = (company.deletion_phase as string) ?? "active";
        if (variant === "offboarding_force" && phase !== "offboarding") {
          send({ error: "Force delete now is only allowed during offboarding." });
          controller.close();
          return;
        }
        if (variant === "access_blocked" && phase !== "access_blocked") {
          send({ error: "Permanent delete is only allowed after access is blocked." });
          controller.close();
          return;
        }

        const result = await runPermanentCompanyPurgeWithProgress(
          admin,
          companyId,
          company.logo_storage_path as string | null,
          (message) => send({ step: message }),
        );

        if (!result.ok) {
          send({ error: result.error });
          controller.close();
          return;
        }

        revalidatePath("/super-admin/companies");
        send({ done: true });
      } catch (e) {
        send({ error: e instanceof Error ? e.message : "Unexpected error." });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
