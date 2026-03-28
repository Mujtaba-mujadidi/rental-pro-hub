import { APP_NAME } from "@rph/shared";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const hasPublicEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let supabaseOk = false;
  let supabaseError: string | null = null;

  if (hasPublicEnv) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.getSession();
      supabaseOk = !error;
      if (error) supabaseError = error.message;
    } catch (e) {
      supabaseError = e instanceof Error ? e.message : "Unknown error";
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium text-zinc-500">{APP_NAME}</p>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Phase 0 — scaffold
      </h1>
      <p className="text-zinc-600">
        Copy{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm">
          apps/web/.env.example
        </code>{" "}
        to{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm">
          apps/web/.env.local
        </code>{" "}
        with your Supabase URL and anon key, then restart{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm">
          npm run web
        </code>
        .
      </p>
      <dl className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Public env</dt>
          <dd className="font-medium text-zinc-900">
            {hasPublicEnv ? "configured" : "missing"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Supabase client</dt>
          <dd className="font-medium text-zinc-900">
            {!hasPublicEnv
              ? "—"
              : supabaseOk
                ? "ready"
                : supabaseError ?? "error"}
          </dd>
        </div>
      </dl>
    </main>
  );
}
