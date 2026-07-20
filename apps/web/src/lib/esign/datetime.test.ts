import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatEsignSignedAt,
  parseEsignDateTimeInput,
  stampValueFromEsignDateInput,
  toEsignDateTimeLocalInput,
} from "@/lib/esign/datetime";

describe("toEsignDateTimeLocalInput", () => {
  it("formats local datetime without seconds", () => {
    const d = new Date(2026, 6, 20, 9, 5, 30);
    expect(toEsignDateTimeLocalInput(d)).toBe("2026-07-20T09:05");
  });
});

describe("formatEsignSignedAt", () => {
  it("includes UK date and seconds", () => {
    const out = formatEsignSignedAt(new Date("2026-07-17T20:16:42.000Z"));
    expect(out).toMatch(/42/);
  });
});

describe("parseEsignDateTimeInput", () => {
  it("returns null for empty", () => {
    expect(parseEsignDateTimeInput("")).toBeNull();
    expect(parseEsignDateTimeInput("   ")).toBeNull();
  });

  it("parses UK stamped values", () => {
    const d = parseEsignDateTimeInput("17/07/2026, 21:16:42");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(6);
    expect(d!.getDate()).toBe(17);
    expect(d!.getSeconds()).toBe(42);
  });

  it("parses datetime-local and date-only", () => {
    expect(parseEsignDateTimeInput("2026-07-17T21:16")).not.toBeNull();
    expect(parseEsignDateTimeInput("2026-07-17")).not.toBeNull();
  });

  it("parses generic Date strings or returns null", () => {
    expect(parseEsignDateTimeInput("2026-07-17T21:16:00.000Z")).not.toBeNull();
    expect(parseEsignDateTimeInput("not-a-date")).toBeNull();
  });
});

describe("stampValueFromEsignDateInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps parsed value or fallback", () => {
    const stamped = stampValueFromEsignDateInput("17/07/2026, 21:16:42");
    expect(stamped).toMatch(/17/);
    const fallback = stampValueFromEsignDateInput("bad");
    expect(fallback).toMatch(/20/);
  });
});
