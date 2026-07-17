/** Helpers for e-sign “date signed” fields (date + time, UK display). */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Value for `<input type="datetime-local">` (local timezone, no seconds). */
export function toEsignDateTimeLocalInput(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Human-readable stamp on the PDF / stored field value (UK, 24h with seconds). */
export function formatEsignSignedAt(d = new Date()): string {
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Parse datetime-local, ISO, date-only, or UK stamped values. */
export function parseEsignDateTimeInput(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;

  const uk = v.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (uk) {
    const d = new Date(
      Number(uk[3]),
      Number(uk[2]) - 1,
      Number(uk[1]),
      Number(uk[4]),
      Number(uk[5]),
      Number(uk[6] ?? "0"),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Convert a signer date input into the value stamped on the PDF. */
export function stampValueFromEsignDateInput(value: string, fallback = new Date()): string {
  const d = parseEsignDateTimeInput(value);
  return formatEsignSignedAt(d ?? fallback);
}
