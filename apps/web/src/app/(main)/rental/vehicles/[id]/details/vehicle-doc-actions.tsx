"use client";

import { useState } from "react";
import { getVehicleDocumentUrlAction } from "@/app/actions/rental-vehicles";
import type { VehicleDocumentRow } from "@/lib/fleet/vehicles";

const actionBtn =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-rph-border bg-rph-raised px-3 text-sm font-medium text-rph-fg-secondary hover:bg-rph-chrome disabled:opacity-50";

async function resolveDocUrl(docId: string) {
  const res = await getVehicleDocumentUrlAction(docId);
  if (!res.ok) throw new Error(res.error);
  return res;
}

export function VehicleDocViewButton({
  doc,
  onError,
}: {
  doc: VehicleDocumentRow;
  onError?: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const { url } = await resolveDocUrl(doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not open document.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className={actionBtn} disabled={pending} onClick={() => void handleClick()}>
      {pending ? "Opening…" : "View"}
    </button>
  );
}

export function VehicleDocDownloadButton({
  doc,
  onError,
}: {
  doc: VehicleDocumentRow;
  onError?: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const { url, fileName } = await resolveDocUrl(doc.id);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Could not download document.");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not download document.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className={actionBtn} disabled={pending} onClick={() => void handleClick()}>
      {pending ? "Preparing…" : "Download"}
    </button>
  );
}
