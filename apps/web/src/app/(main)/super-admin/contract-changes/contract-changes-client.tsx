"use client";

import { reviewContractChangeRequestAction } from "@/app/actions/company-contract-change-review";
import { completeNewLegalEntityTransitionAction } from "@/app/actions/legal-entity-transition";
import { applySignedCompanyContractChangeAction } from "@/app/actions/rental-company-contract";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Row = {
  id: string;
  parent_company_id: string;
  status: string;
  review_status: string;
  transition_type: string;
  created_at: string;
  proposed_name: string | null;
  proposed_legal_name: string | null;
};

export function ContractChangesClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!rows.length) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No open contract change requests.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <p className="font-semibold text-slate-900 dark:text-slate-100">{r.proposed_name ?? "—"}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Company {r.parent_company_id.slice(0, 8)}… · {r.transition_type} · review: {r.review_status}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Legal: {r.proposed_legal_name ?? "—"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.review_status === "pending_review" ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-lg bg-rph-rail px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => {
                    setMsg(null);
                    setErr(null);
                    const fd = new FormData();
                    fd.set("change_id", r.id);
                    fd.set("decision", "approve");
                    startTransition(() => {
                      void (async () => {
                        const res = await reviewContractChangeRequestAction(fd);
                        if (!res.ok) setErr(res.error);
                        else {
                          setMsg("Marked awaiting signature.");
                          router.refresh();
                        }
                      })();
                    });
                  }}
                >
                  Approve → awaiting signature
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-800 dark:border-red-800 dark:text-red-200"
                  onClick={() => {
                    const comment = window.prompt("Rejection comment (required):");
                    if (comment == null) return;
                    if (!comment.trim()) {
                      setErr("Comment required.");
                      return;
                    }
                    setMsg(null);
                    setErr(null);
                    const fd = new FormData();
                    fd.set("change_id", r.id);
                    fd.set("decision", "reject");
                    fd.set("comment", comment.trim());
                    startTransition(() => {
                      void (async () => {
                        const res = await reviewContractChangeRequestAction(fd);
                        if (!res.ok) setErr(res.error);
                        else {
                          setMsg("Rejected.");
                          router.refresh();
                        }
                      })();
                    });
                  }}
                >
                  Reject
                </button>
              </>
            ) : null}
            {r.transition_type === "detail_change" &&
            (r.review_status === "awaiting_signature" || r.review_status === "approved") ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600"
                onClick={() => {
                  setMsg(null);
                  setErr(null);
                  startTransition(() => {
                    void (async () => {
                      const res = await applySignedCompanyContractChangeAction(r.id);
                      if (!res.ok) setErr(res.error);
                      else {
                        setMsg("Legal change applied.");
                        router.refresh();
                      }
                    })();
                  });
                }}
              >
                Apply in-place legal change
              </button>
            ) : null}
            {r.transition_type === "new_legal_entity" &&
            (r.review_status === "awaiting_signature" || r.review_status === "approved") ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                onClick={() => {
                  if (!window.confirm("Create new parent company and migrate all memberships from the old tenant?")) return;
                  setMsg(null);
                  setErr(null);
                  startTransition(() => {
                    void (async () => {
                      const res = await completeNewLegalEntityTransitionAction(r.id);
                      if (!res.ok) setErr(res.error);
                      else {
                        setMsg(`New entity created: ${res.newCompanyId ?? ""}`);
                        router.refresh();
                      }
                    })();
                  });
                }}
              >
                Complete new legal entity
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
    </div>
  );
}
