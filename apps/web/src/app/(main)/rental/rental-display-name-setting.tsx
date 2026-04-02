"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateRentalDisplayNameAction } from "@/app/actions/rental-profile";

export function RentalDisplayNameSetting({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initialName);
  }, [initialName]);

  function save() {
    setError(null);
    setOk(false);
    startTransition(() => {
      void (async () => {
        const res = await updateRentalDisplayNameAction(value);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOk(true);
        router.refresh();
      })();
    });
  }

  return (
    <div className="max-w-xl rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Your display name</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        Shown in the header and dashboard. Invite new staff with their name so it is set automatically when they join.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rph-input-auth min-h-10 flex-1 text-sm shadow-sm"
          placeholder="First and last name"
          autoComplete="name"
          maxLength={120}
        />
        <button
          type="button"
          disabled={pending || value.trim() === initialName.trim()}
          onClick={save}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      {ok ? <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Saved.</p> : null}
    </div>
  );
}
