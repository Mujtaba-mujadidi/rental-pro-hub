"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { listCompanyIdentitiesAction } from "@/app/actions/admin-companies";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  createCollectionDraft,
  listCollectionDrafts,
  migrateLegacySingleDraft,
  pruneCollectionDraftsMatchingCompanies,
  removeCollectionDraft,
  type FormDraftMeta,
} from "@/lib/forms/form-draft-collection";
import { AdminCompaniesTable } from "./admin-companies-table";
import {
  RegisterCompanyModal,
  REGISTER_COMPANY_DRAFT_COLLECTION,
  REGISTER_COMPANY_DRAFT_KEY,
} from "./register-company-modal";

const noticeClass =
  "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100";

const draftPanelClass =
  "rounded-xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900/50 dark:bg-sky-950/30";

const btnRegister =
  "inline-flex shrink-0 items-center justify-center rounded-lg bg-rph-rail px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

const btnRow =
  "inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50";

function formatDraftTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function CompaniesView() {
  const router = useRouter();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<FormDraftMeta[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [prunedNotice, setPrunedNotice] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    migrateLegacySingleDraft(REGISTER_COMPANY_DRAFT_COLLECTION, REGISTER_COMPANY_DRAFT_KEY);

    const identities = await listCompanyIdentitiesAction();
    if (identities.ok) {
      const removed = pruneCollectionDraftsMatchingCompanies(
        REGISTER_COMPANY_DRAFT_COLLECTION,
        identities.companies,
      );
      if (removed > 0) {
        setPrunedNotice(
          removed === 1
            ? "Removed 1 local draft because that company is already registered."
            : `Removed ${removed} local drafts because those companies are already registered.`,
        );
      }
    }

    setDrafts(listCollectionDrafts(REGISTER_COMPANY_DRAFT_COLLECTION));
  }, []);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts, registerOpen, listVersion]);

  const bumpList = useCallback(() => {
    setListVersion((v) => v + 1);
    router.refresh();
  }, [router]);

  const openNewRegistration = useCallback(() => {
    const meta = createCollectionDraft(REGISTER_COMPANY_DRAFT_COLLECTION, "Untitled draft");
    setActiveDraftId(meta.id);
    setRegisterOpen(true);
    void refreshDrafts();
  }, [refreshDrafts]);

  const openDraft = useCallback((id: string) => {
    setActiveDraftId(id);
    setRegisterOpen(true);
  }, []);

  const closeModal = useCallback(
    (open: boolean) => {
      setRegisterOpen(open);
      if (!open) {
        setActiveDraftId(null);
        void refreshDrafts();
      }
    },
    [refreshDrafts],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rph-h1">Companies</h1>
          <p className="rph-muted mt-1 max-w-2xl text-sm">
            Fleet and rental client organisations. Search and filter the directory, or register a new company record.
          </p>
        </div>
        <button type="button" className={btnRegister} onClick={openNewRegistration}>
          Register company
        </button>
      </div>

      <RegisterCompanyModal
        open={registerOpen}
        draftId={activeDraftId}
        onOpenChange={closeModal}
        onDraftsChange={() => {
          void refreshDrafts();
        }}
        onRegistered={(inviteNotice) => {
          bumpList();
          void refreshDrafts();
          if (inviteNotice) setListNotice(inviteNotice);
        }}
      />

      {prunedNotice ? (
        <p className={noticeClass} role="status">
          {prunedNotice}
          <button
            type="button"
            className="ml-3 font-semibold underline decoration-amber-900/35 hover:no-underline dark:decoration-amber-200/35"
            onClick={() => setPrunedNotice(null)}
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {drafts.length > 0 && !registerOpen ? (
        <section className={draftPanelClass} aria-label="Unfinished company registrations">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-sm font-semibold text-sky-950 dark:text-sky-100">
              Unfinished registrations on this device ({drafts.length})
            </h2>
            <p className="text-xs text-sky-800/80 dark:text-sky-200/80">
              Drafts are not in the companies table until you click Create company. Matching registered companies are
              removed from this list automatically.
            </p>
          </div>
          <ul className="mt-3 divide-y divide-sky-200/80 dark:divide-sky-800/80">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sky-950 dark:text-sky-50">{d.label}</p>
                  <p className="text-xs text-sky-800/70 dark:text-sky-300/70">Updated {formatDraftTime(d.updatedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${btnRow} border-sky-300 bg-white text-sky-900 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100 dark:hover:bg-sky-900`}
                    onClick={() => openDraft(d.id)}
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    className={`${btnRow} border-red-200 bg-white text-red-800 hover:bg-red-50 dark:border-red-900/50 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-950/40`}
                    onClick={() => setDeleteId(d.id)}
                  >
                    Delete draft
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete this draft?"
        description="This removes the unfinished registration from this browser only. It does not affect companies already in the table."
        confirmLabel="Delete draft"
        cancelLabel="Keep draft"
        variant="danger"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            removeCollectionDraft(REGISTER_COMPANY_DRAFT_COLLECTION, deleteId);
            setDeleteId(null);
            void refreshDrafts();
          }
        }}
      />
    </div>
  );
}
