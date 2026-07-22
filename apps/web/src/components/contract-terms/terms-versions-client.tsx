"use client";

import type { ComponentType, FormEvent, SVGProps } from "react";
import { stripTagsToPlain, truncatePreview } from "@/lib/contract-terms/plain-preview";
import type { TermsVersionRow, TermsVersionsClientActions } from "@/lib/contract-terms/types";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { useFormModalDraft } from "@/hooks/use-form-modal-draft";
import { TermsRichEditor, TermsRichViewer } from "@/components/contract-terms/terms-rich-editor";
import { TermsVersionRowActionsMenu } from "@/components/contract-terms/terms-version-row-actions-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatUkDate } from "@/lib/datetime/uk";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

function suggestNextVersionLabel(current: string): string {
  const t = current.trim();
  const semver = /^(\d+)\.(\d+)$/.exec(t);
  if (semver) return `${semver[1]}.${Number(semver[2]) + 1}`;
  const integer = /^(\d+)$/.exec(t);
  if (integer) return String(Number(integer[1]) + 1);
  return formatUkDate(new Date());
}

export type TermsVersionsClientConfig = {
  scopeLabel: string;
  scopeDescription: string;
  modalDescription: string;
  publishAfterSaveHelp: string;
  draftKeyPrefix: string;
  searchPlaceholder?: string;
  /** e.g. "terms & conditions" or "permission letter" */
  entityName?: string;
  createButtonLabel?: string;
  modalEditTitle?: string;
  modalCreateTitle?: string;
  contentSectionLabel?: string;
};

function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function IconDoc(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" />
    </svg>
  );
}

function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}

function IconInfo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function statusBadge(status: string) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (status === "published") return `${base} bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200`;
  if (status === "draft") return `${base} bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200`;
  return `${base} bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
        </div>
        <div className={`flex size-10 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="size-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function StackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type ModalMode = "closed" | "create" | "edit" | "view";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pl-10 text-sm text-slate-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

export function TermsVersionsClient({
  initialRows,
  actions,
  config,
  canManage = true,
  onDataChange,
}: {
  initialRows: TermsVersionRow[];
  actions: TermsVersionsClientActions;
  config: TermsVersionsClientConfig;
  canManage?: boolean;
  onDataChange?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalMode>("closed");
  const [editorKey, setEditorKey] = useState(0);
  const [seedBody, setSeedBody] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [title, setTitle] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewRow, setViewRow] = useState<TermsVersionRow | null>(null);
  const [publishAfterSave, setPublishAfterSave] = useState(false);
  const [modalMaximized, setModalMaximized] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<TermsVersionRow | null>(null);

  const entityName = config.entityName ?? "terms & conditions";
  const createButtonLabel = config.createButtonLabel ?? "New terms & conditions";
  const modalEditTitle = config.modalEditTitle ?? "Edit terms & conditions";
  const modalCreateTitle = config.modalCreateTitle ?? "Create terms & conditions";
  const contentSectionLabel = config.contentSectionLabel ?? "Terms & conditions content";

  type TermsFormSnapshot = {
    title: string;
    versionLabel: string;
    bodyHtml: string;
    publishAfterSave: boolean;
  };

  const [formBaseline, setFormBaseline] = useState<TermsFormSnapshot>({
    title: "",
    versionLabel: "",
    bodyHtml: "",
    publishAfterSave: false,
  });

  const formSnapshot = useMemo<TermsFormSnapshot>(
    () => ({ title, versionLabel, bodyHtml, publishAfterSave }),
    [title, versionLabel, bodyHtml, publishAfterSave],
  );

  const applyFormSnapshot = useCallback((s: TermsFormSnapshot) => {
    setTitle(s.title);
    setVersionLabel(s.versionLabel);
    setSeedBody(s.bodyHtml);
    setBodyHtml(s.bodyHtml);
    setPublishAfterSave(s.publishAfterSave);
    setEditorKey((k) => k + 1);
    setErr(null);
  }, []);

  const formOpen = modal === "create" || modal === "edit";
  const termsDraftKey =
    modal === "edit" && editingId
      ? `${config.draftKeyPrefix}:${editingId}`
      : `${config.draftKeyPrefix}:create`;

  const {
    saveNotice,
    hasStoredDraft,
    isDirty,
    saveProgress,
    saveProgressAndClose,
    requestClose,
    requestStartFresh,
    discardConfirmOpen,
    confirmDiscardClose,
    cancelDiscardClose,
    startFreshConfirmOpen,
    confirmStartFresh,
    cancelStartFresh,
    clearAfterSuccess,
  } = useFormModalDraft({
    draftKey: termsDraftKey,
    open: formOpen,
    snapshot: formSnapshot,
    baseline: formBaseline,
    pending,
    applySnapshot: applyFormSnapshot,
    onClose: () => {
      setModal("closed");
      setViewRow(null);
      setEditingId(null);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialRows;
    return initialRows.filter((r) => {
      const plain = stripTagsToPlain(r.body).toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.version_label.toLowerCase().includes(q) ||
        plain.includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [initialRows, search]);

  const stats = useMemo(() => {
    const total = initialRows.length;
    const published = initialRows.filter((r) => r.status === "published").length;
    const drafts = initialRows.filter((r) => r.status === "draft").length;
    const archived = initialRows.filter((r) => r.status === "archived").length;
    return { total, published, drafts, archived };
  }, [initialRows]);

  function openCreate() {
    setErr(null);
    setMsg(null);
    setEditingId(null);
    setFormBaseline({ title: "", versionLabel: "", bodyHtml: "", publishAfterSave: false });
    setModal("create");
  }

  function openView(row: TermsVersionRow) {
    setViewRow(row);
    setModal("view");
  }

  function openEdit(row: TermsVersionRow) {
    if (row.status !== "draft") return;
    setErr(null);
    setMsg(null);
    setEditingId(row.id);
    setFormBaseline({
      title: row.title,
      versionLabel: row.version_label,
      bodyHtml: row.body,
      publishAfterSave: false,
    });
    setModal("edit");
  }

  function openNewVersionFrom(row: TermsVersionRow) {
    setErr(null);
    setMsg(null);
    setEditingId(null);
    setFormBaseline({
      title: row.title,
      versionLabel: suggestNextVersionLabel(row.version_label),
      bodyHtml: row.body,
      publishAfterSave: false,
    });
    setModal("create");
  }

  function requestArchive(row: TermsVersionRow) {
    setErr(null);
    setMsg(null);
    setArchiveTarget(row);
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    const row = archiveTarget;
    startTransition(() => {
      void (async () => {
        const r = await actions.archive(row.id);
        if (!r.ok) setErr(r.error);
        else {
          setMsg("Archived.");
          setArchiveTarget(null);
          onDataChange?.();
          router.refresh();
        }
      })();
    });
  }

  function publishRow(row: TermsVersionRow) {
    setErr(null);
    setMsg(null);
    startTransition(() => {
      void (async () => {
        const r = await actions.publish(row.id);
        if (!r.ok) setErr(r.error);
        else {
          setMsg("Published.");
          onDataChange?.();
          router.refresh();
        }
      })();
    });
  }

  function restoreRow(row: TermsVersionRow) {
    setErr(null);
    setMsg(null);
    startTransition(() => {
      void (async () => {
        const r = await actions.republishArchived(row.id);
        if (!r.ok) setErr(r.error);
        else {
          setMsg("Restored as active. Previous published version was archived.");
          onDataChange?.();
          router.refresh();
        }
      })();
    });
  }

  function closeViewModal() {
    setModal("closed");
    setViewRow(null);
  }

  function submitForm(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const plain = stripTagsToPlain(bodyHtml);
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    if (!versionLabel.trim()) {
      setErr("Version is required.");
      return;
    }
    if (!plain.trim()) {
      setErr("Terms content is required.");
      return;
    }

    const fd = new FormData();
    if (editingId) fd.set("id", editingId);
    fd.set("title", title.trim());
    fd.set("version_label", versionLabel.trim());
    fd.set("body", bodyHtml);

    startTransition(() => {
      void (async () => {
        const res = await actions.saveDraft(fd);
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        let message = editingId ? "Draft updated." : "Draft created.";
        if (publishAfterSave) {
          const pub = await actions.publish(res.id);
          if (!pub.ok) {
            setErr(`Saved as draft, but publish failed: ${pub.error}`);
            router.refresh();
            return;
          }
          message = "Published as the active terms.";
        }
        setMsg(message);
        clearAfterSuccess();
        setModal("closed");
        setViewRow(null);
        setEditingId(null);
        onDataChange?.();
        router.refresh();
      })();
    });
  }

  const charCount = stripTagsToPlain(bodyHtml).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={config.searchPlaceholder ?? "Search terms & conditions"}
            className={inputClass}
            aria-label="Search terms and conditions"
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={!canManage}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer"
        >
          <span className="text-lg leading-none">+</span>
          {createButtonLabel}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={IconDoc} accent="bg-rph-rail" />
        <StatCard label="Published (active)" value={stats.published} icon={CheckIcon} accent="bg-emerald-600" />
        <StatCard label="Drafts" value={stats.drafts} icon={StarIcon} accent="bg-sky-600" />
        <StatCard label="Archived" value={stats.archived} icon={StackIcon} accent="bg-slate-500" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/50">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                <th className="px-4 py-3">Id</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Content</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    No {entityName} match your search. Create a new version to get started.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{row.id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{row.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Version {row.version_label}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{config.scopeLabel}</span>
                      <p className="text-xs text-slate-500">{config.scopeDescription}</p>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {truncatePreview(stripTagsToPlain(row.body))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusBadge(row.status)}>{row.status}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatUkDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <TermsVersionRowActionsMenu
                          row={row}
                          canManage={canManage}
                          disabled={pending}
                          onView={() => openView(row)}
                          onEdit={() => openEdit(row)}
                          onNewVersion={() => openNewVersionFrom(row)}
                          onPublish={() => publishRow(row)}
                          onArchive={() => requestArchive(row)}
                          onRestoreActive={() => restoreRow(row)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p> : null}

      <FormModalShell
        open={formOpen}
        titleId="terms-modal-title"
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{modal === "edit" ? modalEditTitle : modalCreateTitle}</span>
            <span className={statusBadge("draft")}>Draft</span>
          </span>
        }
        description={
          publishAfterSave
            ? `${config.modalDescription} This version will be published when you save.`
            : `${config.modalDescription} This version stays a draft until you publish it from the table or tick “Publish after save”.`
        }
        pending={pending}
        zClass="z-[320]"
        maxWidthClass="max-w-3xl"
        allowMaximize
        onMaximizedChange={setModalMaximized}
        saveNotice={saveNotice}
        hasStoredDraft={hasStoredDraft}
        isDirty={isDirty}
        onSaveProgress={saveProgress}
      onSaveAndClose={saveProgressAndClose}
        onRequestClose={requestClose}
        onRequestStartFresh={requestStartFresh}
        discardConfirmOpen={discardConfirmOpen}
        onConfirmDiscard={confirmDiscardClose}
        onCancelDiscard={cancelDiscardClose}
        startFreshConfirmOpen={startFreshConfirmOpen}
        onConfirmStartFresh={confirmStartFresh}
        onCancelStartFresh={cancelStartFresh}
        footer={
          <>
            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <IconInfo className="size-3.5 shrink-0" />
              Fields marked * are required.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={requestClose}
                disabled={pending}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="terms-form"
                disabled={pending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rph-rail px-4 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer"
              >
                {pending
                  ? "Saving…"
                  : publishAfterSave
                    ? modal === "edit"
                      ? "Save and publish"
                      : "Create and publish"
                    : modal === "edit"
                      ? "Save draft"
                      : "Save as draft"}
              </button>
            </div>
          </>
        }
      >
        <form id="terms-form" onSubmit={submitForm} className="space-y-5">
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Basic information</h3>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Title <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <IconDoc className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Rental platform master terms"
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Version <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 text-sm text-slate-400">#</span>
                <input
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  className={`${inputClass} pl-9`}
                  placeholder="e.g. 2026-04-03 or 1.0"
                  required
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              <IconDoc className="size-4 text-rph-rail dark:text-rph-rail-softer" />
              {contentSectionLabel}
            </h3>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Content <span className="text-red-500">*</span>
            </label>
            <TermsRichEditor
              key={editorKey}
              initialHtml={seedBody}
              onChange={setBodyHtml}
              disabled={pending}
              expanded={modalMaximized}
            />
            <p className="mt-2 text-right text-xs text-slate-500 dark:text-slate-400">{charCount} characters</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Settings</h3>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-950">
              <input
                type="checkbox"
                checked={publishAfterSave}
                onChange={(e) => setPublishAfterSave(e.target.checked)}
                className="mt-1 size-4 rounded border-slate-300 text-rph-rail focus:ring-rph-rail/25 dark:border-slate-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">Publish after save</span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {config.publishAfterSaveHelp}
                </span>
              </span>
            </label>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Drafts stay internal until you publish from here or use the Publish action in the table.
            </p>
          </section>
        </form>
      </FormModalShell>

      {modal === "view" && viewRow ? (
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-view-title"
            className="relative z-[1] flex max-h-[min(90vh,36rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <div>
                <h2 id="terms-view-title" className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  <span>{viewRow.title}</span>
                  <span className={statusBadge(viewRow.status)}>{viewRow.status}</span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Version {viewRow.version_label}</p>
              </div>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={closeViewModal}>
                <IconClose className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <TermsRichViewer html={viewRow.body} />
            </div>
            <div className="border-t border-slate-200 px-6 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={closeViewModal}
                className="w-full rounded-lg bg-rph-rail py-2.5 text-sm font-semibold text-white hover:bg-rph-rail-hover dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer sm:w-auto sm:px-6"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={archiveTarget != null}
        title={`Archive ${entityName}?`}
        description={`This will archive "${archiveTarget?.title ?? ""}" (version ${archiveTarget?.version_label ?? ""}). New hire contracts will no longer use this version until you publish another.\n\nExisting signed contracts are not affected.`}
        confirmLabel="Archive"
        variant="danger"
        pending={pending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}
