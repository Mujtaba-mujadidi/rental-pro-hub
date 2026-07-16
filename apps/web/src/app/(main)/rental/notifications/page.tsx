import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export default async function RentalNotificationsPage() {
  const { profile } = await requireRentalCompanyArea();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("platform_notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <h1 className="rph-h1">Notifications</h1>
      <p className="rph-muted max-w-2xl text-sm">Recent events for your account (contract, payments, reviews).</p>
      {!rows?.length ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No notifications yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {rows.map((n) => (
            <li key={n.id} className="p-4">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.type.replace(/_/g, " ")}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                {n.read_at ? " · Read" : ""}
              </p>
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs dark:bg-slate-900/60">
                {JSON.stringify(n.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
