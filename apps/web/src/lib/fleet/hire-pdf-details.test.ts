import { describe, expect, it } from "vitest";
import {
  formatHireContractEndLabel,
  formatHireContractStartLabel,
  HIRE_PDF_DEFAULT_END_TIME,
  HIRE_PDF_DEFAULT_START_TIME,
  normalizeHireEndTime,
  normalizeHireStartTime,
} from "@/lib/fleet/hire-pdf-details";

describe("normalizeHireStartTime", () => {
  it("defaults missing values to 09:00", () => {
    expect(normalizeHireStartTime(null)).toBe(HIRE_PDF_DEFAULT_START_TIME);
    expect(normalizeHireStartTime("")).toBe(HIRE_PDF_DEFAULT_START_TIME);
  });

  it("normalises HH:MM and HH:MM:SS", () => {
    expect(normalizeHireStartTime("9:05")).toBe("09:05");
    expect(normalizeHireStartTime("14:30:00")).toBe("14:30");
  });
});

describe("formatHireContractStartLabel", () => {
  it("uses the stored start time when provided", () => {
    expect(formatHireContractStartLabel("2026-07-23", "14:30")).toBe("23 July 2026 at 14:30");
  });

  it("falls back to the default hire start time", () => {
    expect(formatHireContractStartLabel("2026-07-23")).toBe("23 July 2026 at 09:00");
  });
});

describe("normalizeHireEndTime", () => {
  it("defaults missing values to 17:00", () => {
    expect(normalizeHireEndTime(null)).toBe(HIRE_PDF_DEFAULT_END_TIME);
    expect(normalizeHireEndTime("")).toBe(HIRE_PDF_DEFAULT_END_TIME);
  });

  it("normalises HH:MM and HH:MM:SS", () => {
    expect(normalizeHireEndTime("17:05")).toBe("17:05");
    expect(normalizeHireEndTime("16:45:00")).toBe("16:45");
  });
});

describe("formatHireContractEndLabel", () => {
  it("uses the stored end time when provided", () => {
    expect(formatHireContractEndLabel("2026-12-31", "16:30")).toBe("31 December 2026 at 16:30");
  });

  it("falls back to the default hire end time", () => {
    expect(formatHireContractEndLabel("2026-12-31")).toBe("31 December 2026 at 17:00");
  });
});
