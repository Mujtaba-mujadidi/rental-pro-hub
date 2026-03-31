"use client";

import { useCallback, useState } from "react";
import { AdminCompaniesTable } from "./admin-companies-table";
import { RegisterCompanyModal } from "./register-company-modal";

const noticeClass =
  "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100";

const btnRegister =
  "inline-flex shrink-0 items-center justify-center rounded-lg bg-rph-rail px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

export function CompaniesView() {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [listNotice, setListNotice] = useState<string | null>(null);

  const bumpList = useCallback(() => {
    setListVersion((v) => v + 1);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rph-h1">Companies</h1>
          <p className="rph-muted mt-1 max-w-2xl text-sm">
            Fleet and rental client organisations. Search and filter the directory, or register a new company record.
          </p>
        </div>
        <button type="button" className={btnRegister} onClick={() => setRegisterOpen(true)}>
          Register company
        </button>
      </div>

      <RegisterCompanyModal
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={(inviteNotice) => {
          bumpList();
          if (inviteNotice) setListNotice(inviteNotice);
        }}
      />

      {listNotice ? (
        <p className={noticeClass} role="status">
          {listNotice}
          <button
            type="button"
            className="ml-3 font-semibold underline decoration-amber-900/35 hover:no-underline dark:decoration-amber-200/35"
            onClick={() => setListNotice(null)}
          >
            Dismiss
          </button>
        </p>
      ) : null}

      <AdminCompaniesTable listVersion={listVersion} onListChange={bumpList} />
    </div>
  );
}
