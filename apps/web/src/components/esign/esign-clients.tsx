"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PdfFieldDesigner } from "@/components/esign/pdf-field-designer";
import { SignatureFieldInput } from "@/components/esign/signature-field-input";
import {
  applyOwnerSignatureQuickAction,
  configureEsignSignatureModeAction,
  getOwnerSavedSignatureAction,
  resendEsignEnvelopeAction,
  saveEsignFieldLayoutAction,
  sendEsignEnvelopeAction,
} from "@/app/actions/esign";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";
import type { HireEnvelopeDesignerContext } from "@/lib/esign/hire-envelope-designer";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";

export type EsignDesignerActions = {
  saveFieldLayout: typeof saveEsignFieldLayoutAction;
  sendEnvelope: typeof sendEsignEnvelopeAction;
  resendEnvelope: typeof resendEsignEnvelopeAction;
  getOwnerSavedSignature: typeof getOwnerSavedSignatureAction;
  applyOwnerSignatureQuick: typeof applyOwnerSignatureQuickAction;
  configureSignatureMode: typeof configureEsignSignatureModeAction;
  refreshContractPdf?: (envelopeId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const superAdminDesignerActions: EsignDesignerActions = {
  saveFieldLayout: saveEsignFieldLayoutAction,
  sendEnvelope: sendEsignEnvelopeAction,
  resendEnvelope: resendEsignEnvelopeAction,
  getOwnerSavedSignature: getOwnerSavedSignatureAction,
  applyOwnerSignatureQuick: applyOwnerSignatureQuickAction,
  configureSignatureMode: configureEsignSignatureModeAction,
};

export { EsignSignClient } from "@/components/esign/signing-viewer";

function PdfLoadingOverlay({ label = "Loading contract…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-200/90 dark:bg-slate-900/90">
      <span
        className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-rph-rail dark:border-slate-600 dark:border-t-sky-400"
        aria-hidden
      />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
    </div>
  );
}

function StepBackButton({
  onClick,
  href,
  label = "Back",
  disabled,
}: {
  onClick?: () => void;
  href?: string;
  label?: string;
  disabled?: boolean;
}) {
  const className =
    "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
  if (href) {
    return (
      <Link href={href} className={className}>
        ← {label}
      </Link>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={className}>
      ← {label}
    </button>
  );
}

function HireBundleDocumentBanner({ ctx }: { ctx: HireEnvelopeDesignerContext }) {
  if (ctx.total <= 1) return null;

  return (
    <div className="mx-4 mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100 md:mx-6">
      <p>
        <span className="font-semibold">
          Contract {ctx.index} of {ctx.total}
        </span>
        {" · "}
        {ctx.lengthLabel} · {ctx.vrm} · ends {formatUkDate(ctx.endDate)}
        {" · "}
        <span className="font-medium">{ctx.preparationLabel}</span>
      </p>
      <p className="text-xs text-amber-900/90 dark:text-amber-100/90">
        This hire has {ctx.total} agreements (same terms, different end dates). Who signs is shared across all of
        them — review signature placement on each contract before sending the bundle to the hirer.
      </p>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {ctx.siblings.map((s) =>
          s.envelopeId ? (
            <Link
              key={s.agreementId}
              href={`/rental/esign/${s.envelopeId}`}
              className={
                s.isCurrent
                  ? "rph-pill-active text-xs"
                  : "rph-pill text-xs hover:bg-rph-chrome"
              }
              aria-current={s.isCurrent ? "page" : undefined}
            >
              {s.index}. {s.lengthLabel} · {s.preparationLabel}
            </Link>
          ) : (
            <span key={s.agreementId} className="rph-pill text-xs opacity-60">
              {s.index}. {s.lengthLabel} · {s.preparationLabel}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function EsignDesignerClient({
  envelopeId,
  title,
  status,
  initialFields,
  hasSignedPdf,
  completedAt,
  ownerSigned,
  requiresOwnerSignature,
  modeConfigured,
  defaultOwnerName = "",
  backHref = "/super-admin/companies",
  backLabel = "Companies",
  designerActions = superAdminDesignerActions,
  recipientOnlyTitle = "Recipient only",
  recipientOnlyDescription = "Customer signs. No platform/owner signature on this envelope.",
  ownerAndRecipientTitle = "Owner + recipient",
  ownerAndRecipientDescription = "You sign first (saved signature reused when available), then send to the customer.",
  hireBundleContext = null,
}: {
  envelopeId: string;
  title: string;
  status: string;
  initialFields: EsignFieldLayoutItem[];
  hasSignedPdf?: boolean;
  completedAt?: string | null;
  ownerSigned?: boolean;
  requiresOwnerSignature?: boolean;
  /** True once the user has chosen recipient-only vs owner+recipient. */
  modeConfigured?: boolean;
  defaultOwnerName?: string;
  backHref?: string;
  backLabel?: string;
  designerActions?: EsignDesignerActions;
  recipientOnlyTitle?: string;
  recipientOnlyDescription?: string;
  ownerAndRecipientTitle?: string;
  ownerAndRecipientDescription?: string;
  /** Hire groups: which agreement in a multi-contract bundle is being prepared. */
  hireBundleContext?: HireEnvelopeDesignerContext | null;
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [requiresOwner, setRequiresOwner] = useState(requiresOwnerSignature === true);
  const [configured, setConfigured] = useState(
    Boolean(modeConfigured || initialFields.length > 0 || ownerSigned),
  );
  const [ownerDone, setOwnerDone] = useState(Boolean(ownerSigned));
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [savedSigChecked, setSavedSigChecked] = useState(false);
  const [ownerStep, setOwnerStep] = useState(false);
  const [draftSig, setDraftSig] = useState<string | null>(null);
  const [ownerFullName, setOwnerFullName] = useState(defaultOwnerName);
  const [modeError, setModeError] = useState<string | null>(null);
  const [resendFeedback, setResendFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [pdfCacheKey, setPdfCacheKey] = useState(0);
  const [pdfReady, setPdfReady] = useState(false);

  const canEditLayout = (status === "awaiting_placement" || status === "draft") && !ownerDone;
  const layoutPrepared = fields.length > 0;
  const canSendToRecipient = layoutPrepared && pdfReady && (!requiresOwner || ownerDone);
  const isCompleted = status === "completed" && hasSignedPdf;
  const unsignedPdfUrl = `/api/esign/${envelopeId}/pdf?v=${pdfCacheKey}`;
  const signedPdfUrl = `/api/esign/${envelopeId}/pdf?variant=signed`;
  const currentPdfUrl = `/api/esign/${envelopeId}/pdf?variant=current&v=${pdfCacheKey}`;
  const documentSubtitle =
    hireBundleContext && hireBundleContext.total > 1
      ? `Contract ${hireBundleContext.index} of ${hireBundleContext.total} · ${hireBundleContext.lengthLabel} · ${hireBundleContext.vrm} · ${hireBundleContext.preparationLabel}`
      : title;
  const canRefreshPdf =
    Boolean(designerActions.refreshContractPdf) &&
    Boolean(hireBundleContext) &&
    !isCompleted &&
    status !== "sent" &&
    status !== "viewed" &&
    !ownerDone;

  function regeneratePdf() {
    if (!designerActions.refreshContractPdf) return;
    setModeError(null);
    startTransition(() => {
      void (async () => {
        const res = await designerActions.refreshContractPdf!(envelopeId);
        if (!res.ok) {
          setModeError(res.error);
          return;
        }
        setPdfCacheKey(Date.now());
        router.refresh();
      })();
    });
  }

  useEffect(() => {
    setFields(initialFields);
  }, [initialFields]);

  useEffect(() => {
    setRequiresOwner(requiresOwnerSignature === true);
  }, [requiresOwnerSignature]);

  useEffect(() => {
    if (!ownerStep || !requiresOwner || ownerDone) return;
    void (async () => {
      const res = await designerActions.getOwnerSavedSignature();
      if (res.ok) setSavedSig(res.dataUrl);
      setSavedSigChecked(true);
    })();
  }, [ownerStep, requiresOwner, ownerDone]);

  function chooseMode(mode: "recipient_only" | "owner_and_recipient") {
    setModeError(null);
    startTransition(() => {
      void (async () => {
        const res = await designerActions.configureSignatureMode(envelopeId, mode);
        if (!res.ok) {
          setModeError(res.error);
          return;
        }
        setRequiresOwner(res.requiresOwner);
        setFields(res.fields);
        setConfigured(true);
        // Only cache-bust when the PDF bytes actually changed
        if (res.pdfRegenerated) setPdfCacheKey(Date.now());
        if (res.hasSavedOwnerSignature) {
          const saved = await designerActions.getOwnerSavedSignature();
          if (saved.ok) setSavedSig(saved.dataUrl);
        }
        setSavedSigChecked(true);
      })();
    });
  }

  function applyOwnerSig(dataUrl: string) {
    const name = ownerFullName.trim();
    if (!name) {
      setModeError("Enter and confirm the owner full name before signing.");
      return;
    }
    setModeError(null);
    startTransition(() => {
      void (async () => {
        const res = await designerActions.applyOwnerSignatureQuick(envelopeId, dataUrl, {
          saveSignature: true,
          ownerFullName: name,
        });
        if (!res.ok) {
          setModeError(res.error);
          return;
        }
        setOwnerDone(true);
        setSavedSig(dataUrl);
        setPdfCacheKey(Date.now());
        router.refresh();
      })();
    });
  }

  if (isCompleted) {
    return (
      <div className="-m-4 flex min-h-0 flex-col md:-m-6">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <StepBackButton href={backHref} label={backLabel} />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Signed contract</h1>
              <p className="truncate text-sm text-slate-500">
                {documentSubtitle}
                {completedAt
                  ? ` · Signed ${formatUkDateTime(completedAt)}`
                  : " · Completed"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={signedPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium"
            >
              Open in new tab
            </a>
            <a
              href={signedPdfUrl}
              download="signed-contract.pdf"
              className="rounded-lg bg-rph-rail px-3 py-1.5 text-sm font-semibold text-white"
            >
              Download PDF
            </a>
          </div>
        </div>
        {hireBundleContext ? <HireBundleDocumentBanner ctx={hireBundleContext} /> : null}
        <div className="relative min-h-0 flex-1 bg-slate-200 p-3 dark:bg-slate-800 md:p-4">
          <iframe
            title="Signed contract PDF"
            src={signedPdfUrl}
            className="h-[calc(100dvh-9rem)] min-h-[28rem] w-full rounded-lg border border-slate-300 bg-white shadow dark:border-slate-600"
          />
        </div>
      </div>
    );
  }

  if (status === "sent" || status === "viewed") {
    function resendToRecipient() {
      setResendFeedback(null);
      startTransition(() => {
        void (async () => {
          const res = await designerActions.resendEnvelope(envelopeId);
          if (!res.ok) {
            setResendFeedback({ ok: false, message: res.error });
            return;
          }
          setResendFeedback({
            ok: true,
            message: "Signing email resent with a new link and access code.",
          });
        })();
      });
    }

    return (
      <div className="-m-4 flex min-h-0 flex-col md:-m-6">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <StepBackButton href={backHref} label={backLabel} />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">Awaiting recipient signature</h1>
              <p className="truncate text-sm text-slate-500">
                {documentSubtitle} · {status === "viewed" ? "Recipient opened the link" : "Sent to recipient"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={currentPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            >
              Open in new tab
            </a>
            <a
              href={currentPdfUrl}
              download="contract.pdf"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            >
              Download PDF
            </a>
            <button
              type="button"
              disabled={pending}
              onClick={resendToRecipient}
              className="rounded-lg bg-rph-rail px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Sending…" : "Resend for signature"}
            </button>
          </div>
        </div>
        {hireBundleContext ? <HireBundleDocumentBanner ctx={hireBundleContext} /> : null}
        {resendFeedback ? (
          <p
            className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-sm md:mx-6 ${
              resendFeedback.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-100"
            }`}
          >
            {resendFeedback.message}
          </p>
        ) : (
          <p className="mx-4 mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100 md:mx-6">
            The recipient can sign via the email link. If they did not receive it, use{" "}
            <strong>Resend for signature</strong> — that sends a new link and access code (the old one stops working).
          </p>
        )}
        <div className="relative min-h-0 flex-1 bg-slate-200 p-3 dark:bg-slate-800 md:p-4">
          <iframe
            title="Contract PDF"
            src={currentPdfUrl}
            className="h-[calc(100dvh-11rem)] min-h-[28rem] w-full rounded-lg border border-slate-300 bg-white shadow dark:border-slate-600"
          />
        </div>
      </div>
    );
  }

  function goBackToModeChoice() {
    setConfigured(false);
    setOwnerStep(false);
    setModeError(null);
    setDraftSig(null);
  }

  // Step 1: who signs?
  if (!configured) {
    return (
      <div className="-m-4 flex min-h-[28rem] flex-col md:-m-6">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <StepBackButton href={backHref} label={backLabel} />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Who needs to sign?</h1>
              <p className="truncate text-sm text-slate-500">{documentSubtitle}</p>
            </div>
          </div>
          {canRefreshPdf ? (
            <button
              type="button"
              disabled={pending}
              onClick={regeneratePdf}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              {pending ? "Regenerating…" : "Regenerate PDF"}
            </button>
          ) : null}
        </div>
        {hireBundleContext ? <HireBundleDocumentBanner ctx={hireBundleContext} /> : null}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Who needs to sign?</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Signature placeholders will be placed automatically at the end of the contract. You can nudge them
              afterwards if needed.
              {hireBundleContext && hireBundleContext.total > 1 ? (
                <>
                  {" "}
                  This choice applies to all {hireBundleContext.total} agreements in this hire (same signing
                  arrangement, different end dates).
                </>
              ) : null}
            </p>
            {modeError ? <p className="text-sm text-red-600">{modeError}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => chooseMode("recipient_only")}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-rph-rail/40 hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
              >
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">{recipientOnlyTitle}</span>
                <span className="mt-1 block text-xs text-slate-500">{recipientOnlyDescription}</span>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => chooseMode("owner_and_recipient")}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-rph-rail/40 hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
              >
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">{ownerAndRecipientTitle}</span>
                <span className="mt-1 block text-xs text-slate-500">{ownerAndRecipientDescription}</span>
              </button>
            </div>
            {pending ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-rph-rail" />
                Preparing placeholders…
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // Owner signature step (after reviewing placeholders)
  if (configured && requiresOwner && !ownerDone && ownerStep) {
    if (!savedSigChecked) {
      return (
        <div className="relative flex min-h-[20rem] items-center justify-center">
          <PdfLoadingOverlay label="Checking saved signature…" />
        </div>
      );
    }
    return (
      <div className="-m-4 flex min-h-[28rem] flex-col md:-m-6">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <StepBackButton
              disabled={pending}
              label="Field review"
              onClick={() => setOwnerStep(false)}
            />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">Owner signature</h1>
              <p className="truncate text-sm text-slate-500">{documentSubtitle}</p>
            </div>
          </div>
        </div>
        {hireBundleContext ? <HireBundleDocumentBanner ctx={hireBundleContext} /> : null}
        <div className="mx-auto w-full max-w-lg space-y-4 p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Confirm your printed name, then apply your signature. Date is filled automatically with today.
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Owner full name
            </span>
            <input
              type="text"
              value={ownerFullName}
              onChange={(e) => setOwnerFullName(e.target.value)}
              placeholder="Enter the name that will appear on the contract"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              autoComplete="name"
            />
          </label>
          {modeError ? <p className="text-sm text-red-600">{modeError}</p> : null}
          {savedSig ? (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Saved signature</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={savedSig} alt="Saved signature" className="h-20 w-full object-contain bg-white" />
              <button
                type="button"
                disabled={pending || !ownerFullName.trim()}
                onClick={() => applyOwnerSig(savedSig)}
                className="w-full rounded-lg bg-rph-rail py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Applying…" : "Use saved signature & continue"}
              </button>
              <p className="text-center text-xs text-slate-500">Or draw a new one below</p>
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              No saved owner signature yet. Draw one below — we’ll save it for future contracts.
            </p>
          )}
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <SignatureFieldInput
              savedSignatureDataUrl={null}
              onChange={setDraftSig}
              onSaveForFutureChange={() => {}}
            />
            <button
              type="button"
              disabled={pending || !draftSig || !ownerFullName.trim()}
              onClick={() => draftSig && applyOwnerSig(draftSig)}
              className="mt-3 w-full rounded-lg bg-rph-rail py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Signing…" : "Sign contract as owner"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-4 flex min-h-0 flex-col md:-m-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {ownerDone ? (
            <StepBackButton href={backHref} label={backLabel} />
          ) : (
            <StepBackButton
              disabled={pending}
              label="Who signs"
              onClick={goBackToModeChoice}
            />
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {ownerDone ? "Ready to send" : "Review signature fields"}
            </h1>
            <p className="truncate text-sm text-slate-500">
              {documentSubtitle} ·{" "}
              {requiresOwner ? (ownerDone ? "Owner signed" : "Owner + recipient") : "Recipient only"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRefreshPdf ? (
            <button
              type="button"
              disabled={pending}
              onClick={regeneratePdf}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              {pending ? "Regenerating…" : "Regenerate PDF"}
            </button>
          ) : null}
          {ownerDone ? (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Owner signature applied — send when ready
            </span>
          ) : null}
          {requiresOwner && !ownerDone ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(() => {
                  void (async () => {
                    const res = await designerActions.saveFieldLayout(envelopeId, fields);
                    if (!res.ok) {
                      setModeError(res.error);
                      return;
                    }
                    setOwnerStep(true);
                    setSavedSigChecked(false);
                  })();
                });
              }}
              className="rounded-lg bg-rph-rail px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Continue to owner signature
            </button>
          ) : null}
        </div>
      </div>
      {hireBundleContext ? <HireBundleDocumentBanner ctx={hireBundleContext} /> : null}
      <p className="mx-4 mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100 md:mx-6">
        Placeholders sit on the execution section at the end of the PDF. Drag them if you need a slight adjustment,
        then {requiresOwner && !ownerDone ? "continue to lessor signature" : "send to the hirer"}.
      </p>
      {modeError ? <p className="mx-4 mt-2 text-sm text-red-600 md:mx-6">{modeError}</p> : null}
      <div className="relative min-h-0 flex-1 p-3 md:p-4">
        <PdfFieldDesigner
          pdfUrl={ownerDone ? currentPdfUrl : unsignedPdfUrl}
          initialFields={fields}
          disabled={!canEditLayout}
          canSend={canSendToRecipient}
          allowOwnerFields={requiresOwner}
          onLoadingChange={(loading) => setPdfReady(!loading)}
          onSave={async (next) => {
            const res = await designerActions.saveFieldLayout(envelopeId, next);
            if (!res.ok) throw new Error(res.error);
            setFields(next);
          }}
          onSend={async () => {
            const res = await designerActions.sendEnvelope(envelopeId);
            if (!res.ok) throw new Error(res.error);
          }}
          onAfterSendSuccess={() => {
            window.setTimeout(() => router.refresh(), 1400);
          }}
        />
      </div>
    </div>
  );
}
