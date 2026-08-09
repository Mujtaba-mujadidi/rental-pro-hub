"use client";

import {
  getHireInsuranceDocumentUrlAction,
  loadHireInsuranceSummaryAction,
  uploadHireInsuranceDocumentAction,
  type HireInsuranceSummary,
} from "@/app/actions/hire-insurance";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";
import {
  HIRE_INSURANCE_TYPE_LABELS,
  HIRE_INSURANCE_TYPES,
  type HireInsuranceType,
} from "@/lib/fleet/hire-insurance";
import { useEffect, useRef, useState, useTransition } from "react";

const cardClass = "rph-card flex h-full flex-col p-3";
const sectionTitleClass = "text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted";

function statusBadgeClass(status: HireInsuranceSummary["status"]): string {
  if (status === "expired") return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100";
  if (status === "expiring" || status === "awaiting_upload") {
    return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
  }
  if (status === "on_file") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  return "bg-rph-chrome text-rph-fg-muted";
}

function statusLabel(status: HireInsuranceSummary["status"]): string {
  if (status === "not_configured") return "Not set";
  if (status === "awaiting_upload") return "Awaiting upload";
  if (status === "on_file") return "On file";
  if (status === "expiring") return "Expiring soon";
  if (status === "expired") return "Expired";
  return status;
}

export function HireInsuranceCard({
  hireGroupId,
  insurance,
  audience,
  onError,
}: {
  hireGroupId: string;
  insurance: HireInsuranceSummary;
  audience: "staff" | "driver";
  onError?: (message: string) => void;
}) {
  const [summary, setSummary] = useState(insurance);
  const [pending, startTransition] = useTransition();
  const [insuranceType, setInsuranceType] = useState<HireInsuranceType | "">(insurance.insuranceType ?? "");
  const [expiryDate, setExpiryDate] = useState(insurance.expiryDate ?? "");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSummary(insurance);
    setInsuranceType(insurance.insuranceType ?? "");
    setExpiryDate(insurance.expiryDate ?? "");
  }, [insurance]);

  function reportError(message: string) {
    onError?.(message);
  }

  function openDocument() {
    startTransition(async () => {
      const res = await getHireInsuranceDocumentUrlAction(hireGroupId, audience);
      if (!res.ok) {
        reportError(res.error);
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  }

  function submitUpload() {
    if (!insuranceType) {
      reportError("Select an insurance type.");
      return;
    }
    if (!expiryDate.trim()) {
      reportError("Insurance expiry date is required.");
      return;
    }
    if (!uploadFiles.length) {
      reportError("Choose a PDF or one or more images.");
      return;
    }

    const fd = new FormData();
    fd.set("hire_group_id", hireGroupId);
    fd.set("audience", audience);
    fd.set("insurance_type", insuranceType);
    fd.set("expiry_date", expiryDate);
    for (const file of uploadFiles) fd.append("files", file);

    startTransition(async () => {
      const res = await uploadHireInsuranceDocumentAction(fd);
      if (!res.ok) {
        reportError(res.error);
        return;
      }
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const refreshed = await loadHireInsuranceSummaryAction(hireGroupId, audience);
      if (refreshed.ok) setSummary(refreshed.data);
    });
  }

  return (
    <section className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <h2 className={sectionTitleClass}>Hire insurance</h2>
        <span
          className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold ${statusBadgeClass(summary.status)}`}
        >
          {statusLabel(summary.status)}
        </span>
      </div>

      {summary.providedByLabel ? (
        <p className="mt-2 text-xs text-rph-fg-secondary">
          Provided by <span className="font-semibold text-rph-fg">{summary.providedByLabel}</span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-rph-fg-muted">Insurance responsibility has not been set for this hire.</p>
      )}

      {summary.attentionMessage ? (
        <p
          className={`mt-2 text-xs ${
            summary.status === "expired" ? "rph-alert-error" : "rph-alert-warning"
          }`}
        >
          {summary.attentionMessage}
        </p>
      ) : null}

      {summary.hasDocument ? (
        <div className="mt-2 space-y-1.5 text-xs">
          {summary.insuranceTypeLabel ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-rph-fg-muted">Type</span>
              <span className="text-right font-semibold text-rph-fg">{summary.insuranceTypeLabel}</span>
            </div>
          ) : null}
          {summary.expiryDate ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-rph-fg-muted">Expires</span>
              <span className="text-right font-semibold text-rph-fg">{formatUkDate(summary.expiryDate)}</span>
            </div>
          ) : null}
          {summary.fileName ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-rph-fg-muted">Certificate</span>
              <span className="truncate text-right font-semibold text-rph-fg">{summary.fileName}</span>
            </div>
          ) : null}
          {summary.uploadedAtLabel ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-rph-fg-muted">Uploaded</span>
              <span className="text-right font-semibold text-rph-fg">
                {formatUkDateTime(summary.uploadedAtLabel)}
              </span>
            </div>
          ) : null}
          <button
            type="button"
            className="rph-btn-ghost mt-2 text-xs"
            disabled={pending}
            onClick={openDocument}
          >
            View certificate
          </button>
        </div>
      ) : null}

      {summary.canUpload ? (
        <div className="mt-3 space-y-3 border-t border-rph-border/80 pt-3">
          <p className="text-xs text-rph-fg-secondary">
            {summary.hasDocument ? "Replace certificate" : "Upload certificate"}
          </p>
          <label className="block space-y-1">
            <span className="text-[10px] font-medium text-rph-fg-muted">Insurance type</span>
            <FormModalSelect
              value={insuranceType || "__none__"}
              disabled={pending}
              placeholder="— Select —"
              onValueChange={(value) =>
                setInsuranceType(
                  (HIRE_INSURANCE_TYPES as readonly string[]).includes(value)
                    ? (value as HireInsuranceType)
                    : "",
                )
              }
              options={[
                { value: "__none__", label: "— Select —" },
                ...HIRE_INSURANCE_TYPES.map((type) => ({
                  value: type,
                  label: HIRE_INSURANCE_TYPE_LABELS[type],
                })),
              ]}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-medium text-rph-fg-muted">Expiry date</span>
            <input
              type="date"
              className="rph-input w-full"
              value={expiryDate}
              disabled={pending}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-medium text-rph-fg-muted">Certificate file</span>
            <input
              ref={fileInputRef}
              type="file"
              className="rph-input w-full text-xs"
              accept="application/pdf,image/*"
              multiple
              disabled={pending}
              onChange={(e) => setUploadFiles(e.target.files ? Array.from(e.target.files) : [])}
            />
            {uploadFiles.length ? (
              <span className="text-[10px] text-rph-fg-muted">
                {uploadFiles.length} file{uploadFiles.length === 1 ? "" : "s"} selected
              </span>
            ) : null}
          </label>
          <button type="button" className="rph-btn-primary text-xs" disabled={pending} onClick={submitUpload}>
            {pending ? "Uploading…" : summary.hasDocument ? "Replace certificate" : "Upload certificate"}
          </button>
        </div>
      ) : summary.providedBy && !summary.hasDocument ? (
        <p className="mt-3 border-t border-rph-border/80 pt-3 text-xs text-rph-fg-muted">
          {summary.providedBy === "driver"
            ? "The driver will upload insurance for this hire."
            : "Your rental company will upload fleet insurance for this hire."}
        </p>
      ) : null}
    </section>
  );
}
