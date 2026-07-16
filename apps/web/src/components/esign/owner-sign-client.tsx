"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeOwnerEsignSigningAction,
  getOwnerSavedSignatureAction,
} from "@/app/actions/esign";
import { GuidedSigningViewer } from "@/components/esign/signing-viewer";
import { fieldsForRole } from "@/lib/esign/roles";
import { ESIGN_OWNER_ROLE } from "@/lib/esign/types";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";

export function EsignOwnerSignClient({
  envelopeId,
  title,
  fields,
  alreadySigned,
}: {
  envelopeId: string;
  title: string;
  fields: EsignFieldLayoutItem[];
  alreadySigned: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(alreadySigned);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savedSig, setSavedSig] = useState<string | null>(null);

  const ownerFields = fieldsForRole(fields, ESIGN_OWNER_ROLE);

  useEffect(() => {
    void (async () => {
      const res = await getOwnerSavedSignatureAction();
      if (res.ok) setSavedSig(res.dataUrl);
    })();
  }, []);

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-lg space-y-4 text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Owner signature recorded</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You can now send this contract to the recipient from the designer.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/super-admin/esign/${envelopeId}`)}
            className="rounded-lg bg-rph-rail px-5 py-2.5 text-sm font-semibold text-white"
          >
            Back to designer
          </button>
        </div>
      </div>
    );
  }

  const pdfUrl = `/api/esign/${envelopeId}/pdf`;

  return (
    <GuidedSigningViewer
      pdfUrl={pdfUrl}
      title={title}
      fields={ownerFields}
      pending={pending}
      error={error}
      savedSignatureDataUrl={savedSig}
      startButtonLabel="Start owner signature"
      submitButtonLabel="Confirm owner signature"
      reviewHint="Sign your fields as contract owner before sending to the recipient."
      onSubmit={(values, options) => {
        setError(null);
        startTransition(() => {
          void (async () => {
            const res = await completeOwnerEsignSigningAction(envelopeId, values, options);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setDone(true);
          })();
        });
      }}
    />
  );
}
