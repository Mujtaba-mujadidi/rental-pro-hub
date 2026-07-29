/** Column meta for {@link responsiveTableCellProps} (TanStack Table `meta` field). */
export type ResponsiveTableColumnMeta = {
  /** Mobile stack label; defaults to string column headers. */
  dataLabel?: string;
  /** Prominent first row field (e.g. VRM, member name) without a label. */
  tablePrimary?: boolean;
  /** Full-width action footer (menus, Open buttons). */
  tableActions?: boolean;
  /** Checkbox column — pinned top-right on mobile cards. */
  tableSelect?: boolean;
};

export function responsiveTableDataLabel(columnDef: {
  header?: unknown;
  meta?: ResponsiveTableColumnMeta;
}): string {
  const meta = columnDef.meta;
  if (meta?.dataLabel !== undefined) return meta.dataLabel;
  const header = columnDef.header;
  return typeof header === "string" ? header : "";
}

export function responsiveTableCellClassName(meta?: ResponsiveTableColumnMeta): string {
  const parts: string[] = [];
  if (meta?.tablePrimary) parts.push("rph-table-primary");
  if (meta?.tableActions) parts.push("rph-table-actions");
  if (meta?.tableSelect) parts.push("rph-table-select");
  return parts.join(" ");
}

/** Spread onto `<td>` for tables inside `.rph-table-responsive`. */
export function responsiveTableCellProps(
  columnDef: { header?: unknown; meta?: ResponsiveTableColumnMeta },
  className = "",
): { "data-label": string; className: string } {
  const meta = columnDef.meta;
  const stackClass = responsiveTableCellClassName(meta);
  const merged = [className, stackClass].filter(Boolean).join(" ");
  return {
    "data-label": responsiveTableDataLabel(columnDef),
    className: merged,
  };
}
