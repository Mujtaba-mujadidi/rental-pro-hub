"use client";

import { formatUkDateTime } from "@/lib/datetime/uk";
import type { HireSignedDocumentRow } from "@/lib/fleet/hire-signed-documents";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = {
  title: string;
  subtitle: string;
  documents: HireSignedDocumentRow[];
  backHref: string;
  backLabel: string;
};

function PdfLoadingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-rph-page/90">
      <span
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
        aria-hidden
      />
      <p className="text-sm font-medium text-rph-fg-secondary">{label}</p>
    </div>
  );
}

export function HireSignedDocumentsView({ title, subtitle, documents, backHref, backLabel }: Props) {
  const [selectedId, setSelectedId] = useState(documents[0]?.envelopeId ?? "");
  const [pdfLoading, setPdfLoading] = useState(true);

  const selected = useMemo(
    () => documents.find((doc) => doc.envelopeId === selectedId) ?? documents[0] ?? null,
    [documents, selectedId],
  );

  useEffect(() => {
    setPdfLoading(true);
  }, [selected?.envelopeId, selected?.pdfUrl]);

  return (
    <div className="-m-4 flex min-h-0 flex-col md:-m-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-rph-border bg-rph-raised px-4 py-3 md:px-6">
        <div className="min-w-0">
          <Link href={backHref} className="text-sm font-medium text-rph-link hover:text-rph-link-hover">
            ← {backLabel}
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-rph-fg">{title}</h1>
          <p className="truncate text-sm text-rph-fg-muted">{subtitle}</p>
        </div>
        {selected ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={selected.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rph-btn-ghost px-3 py-1.5 text-sm"
            >
              Open in new tab
            </a>
            <a
              href={selected.pdfUrl}
              download="signed-hire-agreement.pdf"
              className="rph-btn-primary px-3 py-1.5 text-sm"
            >
              Download PDF
            </a>
          </div>
        ) : null}
      </div>

      {documents.length > 1 ? (
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-rph-border bg-rph-chrome/40 px-4 py-3 md:px-6">
          {documents.map((doc, index) => {
            const active = doc.envelopeId === selected?.envelopeId;
            return (
              <button
                key={doc.envelopeId}
                type="button"
                onClick={() => setSelectedId(doc.envelopeId)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  active ? "rph-pill-active" : "rph-pill"
                }`}
              >
                {index + 1}. {doc.lengthLabel}
              </button>
            );
          })}
        </div>
      ) : null}

      {selected ? (
        <div className="min-w-0 flex-1 bg-rph-page p-3 md:p-4">
          <p className="mb-2 text-sm text-rph-fg-secondary">
            {selected.title}
            {selected.signedAt ? ` · Signed ${formatUkDateTime(selected.signedAt)}` : null}
          </p>
          <div className="relative">
            {pdfLoading ? <PdfLoadingOverlay label="Loading signed document…" /> : null}
            <iframe
              key={selected.pdfUrl}
              title={selected.title}
              src={selected.pdfUrl}
              onLoad={() => setPdfLoading(false)}
              className="h-[calc(100dvh-12rem)] min-h-[28rem] w-full rounded-lg border border-rph-border bg-white shadow"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
