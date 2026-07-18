"use client";

import { useCallback, useState } from "react";
import { RegisterSubcompanyModal } from "./register-subcompany-modal";
import { RentalSubcompaniesTable } from "./rental-subcompanies-table";

const btnRegister =
  "inline-flex shrink-0 items-center justify-center rounded-lg bg-rph-rail px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

export function SubcompaniesView({ canRegisterSubcompany }: { canRegisterSubcompany: boolean }) {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [listVersion, setListVersion] = useState(0);

  const bumpList = useCallback(() => {
    setListVersion((v) => v + 1);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rph-h1">Subcompany</h1>
          <p className="rph-muted mt-1 max-w-2xl text-sm">
            Register and manage subcompanies under your rental parent company.
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            The <span className="font-semibold">primary</span> unit is your default subcompany. The parent
            company holds the contract; signed amendments may sync trading name and primary contact to the primary unit
            only — not full legal entity fields.
          </p>
          {!canRegisterSubcompany ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              You only see subcompanies your admin has granted. Ask an owner or admin to register new subcompanies or adjust
              your access.
            </p>
          ) : null}
        </div>
        {canRegisterSubcompany ? (
          <button type="button" className={btnRegister} onClick={() => setRegisterOpen(true)}>
            Register subcompany
          </button>
        ) : null}
      </div>

      {canRegisterSubcompany ? (
        <RegisterSubcompanyModal
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          onRegistered={() => {
            bumpList();
          }}
        />
      ) : null}

      <RentalSubcompaniesTable listVersion={listVersion} />
    </div>
  );
}
