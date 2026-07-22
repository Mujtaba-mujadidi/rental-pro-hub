"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  completeHireBundleAgreementAction,
  getHireBundleSavedSignatureAction,
  loadHireBundleAgreementFieldsAction,
  loadHireBundleSigningStateAction,
  verifyHireBundleOtpAction,
} from "@/app/actions/hire-signing";
import { GuidedSigningViewer } from "@/components/esign/signing-viewer";
import { hireBundleCurrentIndex } from "@/lib/fleet/hire-signing-bundle";
import { hireSignedDocumentPdfUrl } from "@/lib/fleet/hire-signed-documents";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";
import type { FieldValueMap } from "@/lib/esign/pdf-stamp";

type AgreementState = {
  envelopeId: string;
  title: string;
  lengthLabel: string;
  signed: boolean;
};

function PrivacyNotice() {
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
      <summary className="cursor-pointer font-medium text-slate-800 dark:text-slate-100">
        Privacy notice (UK GDPR)
      </summary>
      <p className="mt-2 leading-relaxed">
        We process your email address, name, signature image, IP address, browser user agent, and timestamps to
        conclude and evidence these agreements (lawful basis: performance of a contract). This is an electronic
        signature for contractual acceptance, not a qualified electronic signature (eIDAS QES).
      </p>
    </details>
  );
}

export function HireBundleSignClient({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [verified, setVerified] = useState(false);
  const [allSigned, setAllSigned] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [vehicleVrm, setVehicleVrm] = useState("");
  const [hirerName, setHirerName] = useState("");
  const [agreements, setAgreements] = useState<AgreementState[]>([]);
  const [currentFields, setCurrentFields] = useState<EsignFieldLayoutItem[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [sessionSignature, setSessionSignature] = useState<string | null>(null);
  const [bundleExpired, setBundleExpired] = useState(false);

  const effectiveSavedSignature = sessionSignature ?? savedSig;

  const refresh = useCallback(() => {
    startTransition(() => {
      void (async () => {
        const res = await loadHireBundleSigningStateAction(token);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setCompanyName(res.companyName);
        setVehicleVrm(res.vehicleVrm);
        setHirerName(res.hirerName);
        setAgreements(res.agreements);
        setVerified(res.bundleVerified);
        setAllSigned(res.allSigned);
        setBundleExpired(res.bundleExpired);
        setError(null);
      })();
    });
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const currentIndex = useMemo(() => hireBundleCurrentIndex(agreements.map((a) => ({ signed: a.signed }))), [agreements]);
  const currentAgreement = agreements[currentIndex] ?? null;
  const totalCount = agreements.length;
  const signedCount = agreements.filter((a) => a.signed).length;

  useEffect(() => {
    if (!verified || !currentAgreement || currentAgreement.signed) {
      setCurrentFields([]);
      return;
    }
    setFieldsLoading(true);
    void loadHireBundleAgreementFieldsAction(token, currentAgreement.envelopeId).then((res) => {
      setFieldsLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCurrentFields(res.fields);
      setError(null);
    });
  }, [verified, currentAgreement, token]);

  useEffect(() => {
    if (!verified) return;
    void getHireBundleSavedSignatureAction(token).then((res) => {
      if (res.ok) setSavedSig(res.dataUrl);
    });
  }, [verified, token, currentAgreement?.envelopeId]);

  function verify() {
    setError(null);
    startTransition(() => {
      void (async () => {
        const res = await verifyHireBundleOtpAction(token, otp);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setVerified(true);
        refresh();
      })();
    });
  }

  if (bundleExpired && !allSigned) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm">
        <h1 className="text-lg font-semibold">Link expired</h1>
        <p className="mt-2 text-slate-600">Ask {companyName || "the rental company"} to resend the signing email.</p>
      </div>
    );
  }

  if (allSigned) {
    const signedAgreements = allSigned ? agreements : agreements.filter((a) => a.signed);
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4 text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">All agreements signed</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Thank you. Your electronic signatures have been recorded for{" "}
            <strong>
              {totalCount} vehicle hire agreement{totalCount === 1 ? "" : "s"}
            </strong>{" "}
            ({vehicleVrm}).
          </p>
          {signedAgreements.length ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-left dark:border-slate-700 dark:bg-slate-950">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Download your signed copies</p>
              <ul className="mt-3 space-y-2">
                {signedAgreements.map((a, i) => {
                  const pdfUrl = hireSignedDocumentPdfUrl(a.envelopeId, token);
                  return (
                    <li key={a.envelopeId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">
                        {i + 1}. {a.lengthLabel}
                      </span>
                      <span className="flex gap-2">
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-rph-link hover:text-rph-link-hover"
                        >
                          View
                        </a>
                        <a href={pdfUrl} download={`${a.lengthLabel}-signed.pdf`} className="font-medium text-rph-link hover:text-rph-link-hover">
                          Download
                        </a>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-xl font-semibold">Sign hire agreements</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <strong>{companyName}</strong> has sent you{" "}
            {totalCount === 1 ? "a vehicle hire agreement" : `${totalCount} vehicle hire agreements`} for{" "}
            <strong>{vehicleVrm}</strong>
            {hirerName ? ` (${hirerName})` : ""}. Enter the access code from your email to begin.
          </p>
          {totalCount > 1 ? (
            <ul className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40">
              {agreements.map((a, i) => (
                <li key={a.envelopeId}>
                  {i + 1}. {a.lengthLabel}
                  {a.signed ? " · signed" : ""}
                </li>
              ))}
            </ul>
          ) : null}
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

  if (!currentAgreement || currentAgreement.signed) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-sm text-slate-600">
        Loading next agreement…
      </div>
    );
  }

  const stepNumber = signedCount + 1;
  const pdfUrl = `/api/esign/${currentAgreement.envelopeId}/pdf?bundleToken=${encodeURIComponent(token)}&variant=current`;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Agreement {stepNumber} of {totalCount}
        </p>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          {currentAgreement.lengthLabel} · {vehicleVrm}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{currentAgreement.title}</p>
        {totalCount > 1 ? (
          <div className="mt-3 flex gap-1">
            {agreements.map((a, i) => (
              <span
                key={a.envelopeId}
                className={`h-1.5 flex-1 rounded-full ${
                  a.signed ? "bg-emerald-500" : i === currentIndex ? "bg-rph-rail" : "bg-slate-200 dark:bg-slate-700"
                }`}
              />
            ))}
          </div>
        ) : null}
      </header>

      {fieldsLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading agreement…</div>
      ) : (
        <div className="min-h-0 flex-1">
          <GuidedSigningViewer
            key={currentAgreement.envelopeId}
            sessionKey={currentAgreement.envelopeId}
            pdfUrl={pdfUrl}
            title={currentAgreement.title}
            fields={currentFields}
            pending={pending}
            error={error}
            savedSignatureDataUrl={effectiveSavedSignature}
            prefillSignerName={hirerName}
            startButtonLabel={totalCount > 1 ? `Start agreement ${stepNumber}` : "Start signing"}
            submitButtonLabel={
              stepNumber < totalCount ? "Sign & continue to next agreement" : "Finish & submit all agreements"
            }
            reviewHint={
              totalCount > 1
                ? `Review this agreement, then sign. You have ${totalCount - signedCount} agreement${totalCount - signedCount === 1 ? "" : "s"} in this session.`
                : undefined
            }
            onSubmit={(values: FieldValueMap, options) => {
              setError(null);
              startTransition(() => {
                void (async () => {
                  const res = await completeHireBundleAgreementAction(
                    token,
                    currentAgreement.envelopeId,
                    values,
                    options,
                  );
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  if (options?.saveSignature && options.signatureDataUrl) {
                    setSessionSignature(options.signatureDataUrl);
                    setSavedSig(options.signatureDataUrl);
                  } else {
                    const saved = await getHireBundleSavedSignatureAction(token);
                    if (saved.ok) {
                      setSavedSig(saved.dataUrl);
                      setSessionSignature(saved.dataUrl);
                    }
                  }
                  if (res.allSigned) {
                    setAllSigned(true);
                    refresh();
                    return;
                  }
                  refresh();
                })();
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
