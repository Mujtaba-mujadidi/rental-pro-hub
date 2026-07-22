"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  completeEsignSigningAction,
  getRecipientSavedSignatureAction,
  verifyEsignOtpAction,
} from "@/app/actions/esign";
import { SignatureFieldInput } from "@/components/esign/signature-field-input";
import { usePdfPages } from "@/components/esign/use-pdf-pages";
import type { EsignFieldLayoutItem, EsignFieldType } from "@/lib/esign/types";
import { signableFieldLayout, buildSignerPrefillValues } from "@/lib/esign/field-values";
import type { FieldValueMap } from "@/lib/esign/pdf-stamp";
import {
  parseEsignDateTimeInput,
  stampValueFromEsignDateInput,
  toEsignDateTimeLocalInput,
} from "@/lib/esign/datetime";

const FIELD_STYLES: Record<
  EsignFieldType,
  { label: string; border: string; bg: string; ring: string }
> = {
  signature: {
    label: "Signature",
    border: "border-amber-500",
    bg: "bg-amber-400/30",
    ring: "ring-amber-400",
  },
  date: {
    label: "Date & time",
    border: "border-emerald-500",
    bg: "bg-emerald-400/30",
    ring: "ring-emerald-400",
  },
  text: {
    label: "Text",
    border: "border-sky-500",
    bg: "bg-sky-400/30",
    ring: "ring-sky-400",
  },
};

function sortFields(fields: EsignFieldLayoutItem[]) {
  return [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}

function isFilled(field: EsignFieldLayoutItem, values: FieldValueMap) {
  const v = values[field.id];
  return Boolean(v?.value?.trim());
}

function PrivacyNotice() {
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
      <summary className="cursor-pointer font-medium text-slate-800 dark:text-slate-100">
        Privacy notice (UK GDPR)
      </summary>
      <p className="mt-2 leading-relaxed">
        We process your email address, name (if provided), signature image, IP address, browser user agent,
        and timestamps to conclude and evidence this agreement (lawful basis: performance of a contract /
        related security). Records are retained for the contract period plus a retention window for
        legal/accounting needs, then deleted or anonymised according to our retention policy. This is an
        electronic signature for contractual acceptance, not a qualified electronic signature (eIDAS QES).
        Contact the organisation that sent this request for data subject rights (access, erasure where
        applicable).
      </p>
    </details>
  );
}

function firstSignatureValue(values: FieldValueMap, fields: EsignFieldLayoutItem[]): string | undefined {
  for (const f of fields) {
    if (f.type === "signature" && values[f.id]?.value) return values[f.id]!.value;
  }
  return undefined;
}

/** Full-document signing UI with DocuSeal-style guided field walkthrough. */
export function GuidedSigningViewer({
  pdfUrl,
  title,
  fields,
  onSubmit,
  pending,
  error,
  savedSignatureDataUrl,
  prefillSignerName,
  sessionKey,
  startButtonLabel = "Start signing",
  submitButtonLabel = "Finish & submit",
  reviewHint = "Scroll the full document above. When you start, we'll take you to each field in order.",
}: {
  pdfUrl: string;
  title: string;
  fields: EsignFieldLayoutItem[];
  onSubmit: (
    values: FieldValueMap,
    options?: { saveSignature?: boolean; signatureDataUrl?: string },
  ) => void;
  pending: boolean;
  error: string | null;
  savedSignatureDataUrl?: string | null;
  /** Pre-fill name and date/time fields (hirer signing). */
  prefillSignerName?: string;
  /** When this changes, the walkthrough resets (e.g. next agreement in a bundle). */
  sessionKey?: string;
  startButtonLabel?: string;
  submitButtonLabel?: string;
  reviewHint?: string;
}) {
  const ordered = sortFields(signableFieldLayout(fields));
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<FieldValueMap>({});
  const [draft, setDraft] = useState("");
  const [saveForFuture, setSaveForFuture] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fieldEls = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setStarted(false);
    setStepIndex(0);
    setDraft("");
    setSaveForFuture(false);
    setValues(buildSignerPrefillValues(fields, { signerName: prefillSignerName }));
  }, [sessionKey, fields, prefillSignerName]);

  const { pageCount, ready: pdfReady } = usePdfPages(pdfUrl, "sign-page-", {
    scale: 1.15,
    onError: (message) => setPdfError(message),
  });

  const current = started ? ordered[stepIndex] ?? null : null;
  const allFilled = ordered.length > 0 && ordered.every((f) => isFilled(f, values));

  const scrollToField = useCallback((fieldId: string) => {
    const el = fieldEls.current[fieldId];
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, []);

  useEffect(() => {
    if (!current) return;
    if (current.type === "date") {
      const existing = values[current.id]?.value;
      const parsed = existing ? parseEsignDateTimeInput(existing) : null;
      setDraft(toEsignDateTimeLocalInput(parsed ?? new Date()));
    } else {
      setDraft(values[current.id]?.value ?? "");
    }
    const t = window.setTimeout(() => scrollToField(current.id), 80);
    return () => window.clearTimeout(t);
  }, [current, scrollToField, values]);

  function submitAll(finalValues: FieldValueMap) {
    const sig = firstSignatureValue(finalValues, ordered);
    onSubmit(finalValues, {
      saveSignature: saveForFuture && Boolean(sig),
      signatureDataUrl: sig,
    });
  }

  function startSigning() {
    if (ordered.length === 0) return;
    setStarted(true);
    const firstEmpty = ordered.findIndex((f) => !isFilled(f, values));
    setStepIndex(firstEmpty >= 0 ? firstEmpty : 0);
  }

  function saveCurrentAndAdvance() {
    if (!current) return;
    const value =
      current.type === "signature"
        ? draft
        : current.type === "date"
          ? stampValueFromEsignDateInput(draft || toEsignDateTimeLocalInput())
          : draft.trim();
    if (!value) return;

    const nextValues: FieldValueMap = {
      ...values,
      [current.id]: { type: current.type, value },
    };
    setValues(nextValues);

    const nextEmpty = ordered.findIndex((f, i) => i > stepIndex && !isFilled(f, nextValues));
    if (nextEmpty >= 0) {
      setStepIndex(nextEmpty);
      return;
    }
    const firstEmpty = ordered.findIndex((f) => !isFilled(f, nextValues));
    if (firstEmpty >= 0) {
      setStepIndex(firstEmpty);
      return;
    }
    setStepIndex(ordered.length - 1);
  }

  function goToField(index: number) {
    setStepIndex(index);
    setStarted(true);
  }

  return (
    <div className="relative flex h-dvh flex-col bg-slate-200 dark:bg-slate-900">
      {!pdfReady && !pdfError ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-slate-200 dark:bg-slate-900">
          <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-300 border-t-rph-rail" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Loading contract…</p>
        </div>
      ) : null}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h1>
          <p className="text-xs text-slate-500">
            {started
              ? `Field ${Math.min(stepIndex + 1, ordered.length)} of ${ordered.length}`
              : "Review the document, then start signing"}
          </p>
        </div>
        {!started ? (
          <button
            type="button"
            disabled={ordered.length === 0 || Boolean(pdfError) || !pdfReady}
            onClick={startSigning}
            className="rounded-lg bg-rph-rail px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {startButtonLabel}
          </button>
        ) : allFilled ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => submitAll(values)}
            className="rounded-lg bg-rph-rail px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Submitting…" : submitButtonLabel}
          </button>
        ) : null}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-10 px-3 py-6 sm:px-6">
          {pdfError ? <p className="text-sm text-red-600">{pdfError}</p> : null}
          {Array.from({ length: Math.max(pageCount, 1) }, (_, i) => i + 1).map((page) => (
            <div key={page} className="w-full max-w-[820px]">
              <div className="relative mx-auto w-fit shadow-xl ring-1 ring-black/10">
                <canvas id={`sign-page-${page}`} className="block max-w-full bg-white" />
                {ordered
                  .filter((f) => f.page === page)
                  .map((f) => {
                    const style = FIELD_STYLES[f.type];
                    const filled = isFilled(f, values);
                    const active = current?.id === f.id;
                    return (
                      <div
                        key={f.id}
                        ref={(el) => {
                          fieldEls.current[f.id] = el;
                        }}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          const idx = ordered.findIndex((x) => x.id === f.id);
                          if (idx >= 0) goToField(idx);
                        }}
                        className={`absolute box-border border-2 ${style.border} ${style.bg} ${
                          active ? `z-20 ring-4 ${style.ring} ring-offset-1` : "z-10"
                        } ${filled ? "opacity-90" : "opacity-100"} cursor-pointer`}
                        style={{
                          left: `${f.x * 100}%`,
                          top: `${f.y * 100}%`,
                          width: `${f.w * 100}%`,
                          height: `${f.h * 100}%`,
                        }}
                        title={style.label}
                      >
                        {f.type === "signature" && filled ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={values[f.id]!.value}
                            alt="Signature"
                            className="h-full w-full object-contain"
                          />
                        ) : filled ? (
                          <span className="flex h-full items-center overflow-hidden px-1 text-[11px] font-medium text-slate-900">
                            {values[f.id]!.value}
                          </span>
                        ) : (
                          <span className="flex h-full items-center px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                            {f.label ?? style.label}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
              <p className="mt-2 text-center text-xs font-medium text-slate-600 dark:text-slate-300">
                Page {page}
              </p>
            </div>
          ))}
          <div className="h-40 w-full shrink-0" aria-hidden />
        </div>
      </div>

      {!started ? (
        <div className="shrink-0 border-t border-slate-300 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-950">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Ready to sign?</p>
              <p className="text-xs text-slate-500">{reviewHint}</p>
            </div>
            <button
              type="button"
              disabled={ordered.length === 0 || Boolean(pdfError) || !pdfReady}
              onClick={startSigning}
              className="shrink-0 rounded-lg bg-rph-rail px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {startButtonLabel}
            </button>
          </div>
          <div className="mx-auto mt-3 max-w-3xl">
            <PrivacyNotice />
          </div>
        </div>
      ) : current ? (
        <div className="shrink-0 border-t border-slate-300 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] dark:border-slate-700 dark:bg-slate-950">
          <div className="mx-auto max-w-3xl space-y-3 px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {current.label ?? FIELD_STYLES[current.type].label}
                <span className="ml-2 font-normal text-slate-500">
                  · {stepIndex + 1}/{ordered.length}
                </span>
              </p>
              <div className="flex gap-1">
                {ordered.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    title={`Go to field ${i + 1}`}
                    onClick={() => goToField(i)}
                    className={`h-2 w-2 rounded-full ${
                      isFilled(f, values)
                        ? "bg-emerald-500"
                        : i === stepIndex
                          ? "bg-rph-rail"
                          : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  />
                ))}
              </div>
            </div>

            {current.type === "signature" ? (
              <SignatureFieldInput
                key={current.id}
                autoFocus
                savedSignatureDataUrl={savedSignatureDataUrl}
                onChange={(dataUrl) => setDraft(dataUrl ?? "")}
                onSaveForFutureChange={setSaveForFuture}
              />
            ) : current.type === "date" ? (
              <input
                type="datetime-local"
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              <input
                type="text"
                autoFocus
                placeholder={current.label?.toLowerCase().includes("name") ? "Enter full name" : "Enter text"}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCurrentAndAdvance();
                }}
              />
            )}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (stepIndex <= 0) {
                    setStarted(false);
                    return;
                  }
                  setStepIndex((i) => Math.max(0, i - 1));
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-600"
              >
                {stepIndex <= 0 ? "Back to review" : "Back"}
              </button>
              <div className="flex gap-2">
                {allFilled ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => submitAll(values)}
                    className="rounded-lg bg-rph-rail px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {pending ? "Submitting…" : submitButtonLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!draft.trim() && current.type !== "date"}
                    onClick={saveCurrentAndAdvance}
                    className="rounded-lg bg-rph-rail px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {stepIndex >= ordered.length - 1 ? "Save" : "Next"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EsignSignClient({
  token,
  envelopeId,
  title,
  fields,
  initiallyVerified,
  alreadySigned,
}: {
  token: string;
  envelopeId: string;
  title: string;
  fields: EsignFieldLayoutItem[];
  initiallyVerified: boolean;
  alreadySigned: boolean;
}) {
  const [verified, setVerified] = useState(initiallyVerified);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadySigned);
  const [pending, startTransition] = useTransition();
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [savedSigLoaded, setSavedSigLoaded] = useState(false);

  useEffect(() => {
    if (!verified || savedSigLoaded) return;
    void (async () => {
      const res = await getRecipientSavedSignatureAction(token);
      if (res.ok) setSavedSig(res.dataUrl);
      setSavedSigLoaded(true);
    })();
  }, [verified, savedSigLoaded, token]);

  function verify() {
    setError(null);
    startTransition(() => {
      void (async () => {
        const res = await verifyEsignOtpAction(token, otp);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setVerified(true);
      })();
    });
  }

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-lg space-y-3 text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Signed</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Thank you. Your electronic signature has been recorded for <strong>{title}</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-xl font-semibold">Verify access</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Enter the 6-digit access code from your email to view and sign <strong>{title}</strong>.
          </p>
          <PrivacyNotice />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 tracking-widest dark:border-slate-600 dark:bg-slate-950"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={pending || otp.length !== 6}
            onClick={verify}
            className="w-full rounded-lg bg-rph-rail py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Checking…" : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  const pdfUrl = `/api/esign/${envelopeId}/pdf?token=${encodeURIComponent(token)}&variant=current`;

  return (
    <GuidedSigningViewer
      pdfUrl={pdfUrl}
      title={title}
      fields={fields}
      pending={pending}
      error={error}
      savedSignatureDataUrl={savedSig}
      onSubmit={(values, options) => {
        setError(null);
        startTransition(() => {
          void (async () => {
            const res = await completeEsignSigningAction(token, values, options);
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
