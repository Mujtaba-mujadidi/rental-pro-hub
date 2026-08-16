"use client";

import { RphSelect, rphSelectRowsTriggerClass } from "@/components/forms/rph-select";

export const RPH_TABLE_PAGE_SIZES = [10, 25, 50, 100] as const;

/** Shared list footer: Showing X–Y of Z · Previous / Next · Rows. */
export function RphTablePaginationBar({
  pageIndex,
  pageCount,
  pageSize,
  total,
  fromRow,
  toRow,
  disabled,
  onPrevious,
  onNext,
  onPageSizeChange,
  className = "",
}: {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  total: number;
  fromRow: number;
  toRow: number;
  disabled?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
}) {
  if (total === 0) return null;
  return (
    <div
      className={`flex shrink-0 flex-col gap-2 border-t border-rph-border bg-rph-raised/95 px-4 py-2.5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${className}`.trim()}
    >
      <p className="rph-muted shrink-0 text-xs">
        Showing {fromRow.toLocaleString("en-GB")}–{toRow.toLocaleString("en-GB")} of{" "}
        {total.toLocaleString("en-GB")}
      </p>
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto [scrollbar-width:thin]">
        <button
          type="button"
          className="rph-btn-ghost h-9 shrink-0 px-3 text-sm"
          disabled={disabled || pageIndex <= 0}
          onClick={onPrevious}
        >
          Previous
        </button>
        <span className="rph-muted shrink-0 whitespace-nowrap text-xs">
          Page {pageIndex + 1} of {pageCount}
        </span>
        <button
          type="button"
          className="rph-btn-ghost h-9 shrink-0 px-3 text-sm"
          disabled={disabled || pageIndex >= pageCount - 1}
          onClick={onNext}
        >
          Next
        </button>
        <span className="rph-muted shrink-0 whitespace-nowrap text-xs">Rows</span>
        <RphSelect
          value={String(pageSize)}
          disabled={disabled}
          aria-label="Rows per page"
          triggerClassName={rphSelectRowsTriggerClass}
          options={RPH_TABLE_PAGE_SIZES.map((size) => ({
            value: String(size),
            label: String(size),
          }))}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        />
      </div>
    </div>
  );
}
