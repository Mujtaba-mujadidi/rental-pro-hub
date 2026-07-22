"use client";

import {
  archiveCompanyHirePermissionLetterVersionAction,
  listCompanyHirePermissionLetterVersionsAction,
  publishCompanyHirePermissionLetterVersionAction,
  republishArchivedCompanyHirePermissionLetterVersionAction,
  saveCompanyHirePermissionLetterDraftAction,
} from "@/app/actions/rental-hire-permission";
import { TermsVersionsClient } from "@/components/contract-terms/terms-versions-client";
import type { TermsVersionRow } from "@/lib/contract-terms/types";
import { useEffect, useState, useTransition } from "react";

const PERMISSION_LETTER_CONFIG = {
  scopeLabel: "Your rental company",
  scopeDescription: "Driver permission letter",
  modalDescription: "Add or update the permission letter included in hire contracts after terms & conditions.",
  publishAfterSaveHelp:
    "Makes this the active published permission letter for new hire agreements (any current published version is archived).",
  draftKeyPrefix: "hire-permission-letter",
  searchPlaceholder: "Search permission letters",
  entityName: "permission letter",
  createButtonLabel: "New permission letter",
  modalEditTitle: "Edit permission letter",
  modalCreateTitle: "Create permission letter",
  contentSectionLabel: "Permission letter content",
} as const;

const permissionLetterActions = {
  saveDraft: saveCompanyHirePermissionLetterDraftAction,
  publish: publishCompanyHirePermissionLetterVersionAction,
  archive: archiveCompanyHirePermissionLetterVersionAction,
  republishArchived: republishArchivedCompanyHirePermissionLetterVersionAction,
};

export function HirePermissionLetterSettingsSection() {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<TermsVersionRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    startTransition(async () => {
      const res = await listCompanyHirePermissionLetterVersionsAction();
      if (!res.ok) {
        setError(res.error);
        setLoaded(true);
        return;
      }
      setRows(res.rows);
      setCanManage(res.canManage);
      setLoaded(true);
      setError(null);
    });
  }

  useEffect(() => {
    reload();
  }, []);

  if (!loaded && pending) {
    return <p className="rph-muted text-sm">Loading permission letter…</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Permission letter</h2>
        <p className="rph-meta mt-1">
          Published permission letters are snapshotted into each new hire contract after terms &amp; conditions. Draft,
          publish, and archive versions the same way as hire terms.
        </p>
      </div>
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      <TermsVersionsClient
        initialRows={rows}
        actions={permissionLetterActions}
        config={PERMISSION_LETTER_CONFIG}
        canManage={canManage}
        onDataChange={reload}
      />
    </section>
  );
}
