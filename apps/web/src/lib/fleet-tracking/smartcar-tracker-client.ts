import { createHash } from "crypto";
import type { TrackerDevice } from "@/lib/fleet-tracking/mapping";

const API_BASE = "https://api.protrack365.com";

const HALF_HOUR_SEC = 30 * 60;
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

type TokenCacheEntry = { accessToken: string; expiresAtMs: number };
const tokenCache = new Map<string, TokenCacheEntry>();

export type TrackerTrackRecord = {
  imei: string;
  servertime?: number;
  gpstime?: number;
  hearttime?: number;
  systemtime?: number;
  longitude?: number;
  latitude?: number;
  course?: number;
  speed?: number;
  accstatus?: number;
  datastatus?: number;
  mileage?: number;
  todaymileage?: number;
  battery?: number;
  externalpower?: string;
};

function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

function signatureFor(password: string, time: number): string {
  return md5Hex(md5Hex(password) + String(time));
}

async function getJson(url: string): Promise<{ code: number; message?: string; record?: unknown }> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SmartCar Tracker API HTTP ${res.status}`);
  }
  return (await res.json()) as { code: number; message?: string; record?: unknown };
}

/** POST with form body (required for SET_MILEAGE paramData JSON). */
async function postForm(url: string, body: URLSearchParams): Promise<{ code: number; message?: string; record?: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SmartCar Tracker API HTTP ${res.status}`);
  }
  return (await res.json()) as { code: number; message?: string; record?: unknown };
}

/** POST with query string params (simple commands without paramData). */
async function postQuery(url: string, params: URLSearchParams): Promise<{ code: number; message?: string; record?: unknown }> {
  const res = await fetch(`${url}?${params.toString()}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SmartCar Tracker API HTTP ${res.status}`);
  }
  return (await res.json()) as { code: number; message?: string; record?: unknown };
}

/** Map common device firmware ERROR codes (Concox / GT03 family, etc.) to plain English. */
export function explainDeviceCommandError(response: string): string | null {
  const m = /error\s*:?\s*(\d+)/i.exec(response.trim());
  if (!m) return null;
  switch (m[1]) {
    case "100":
      return "Command too long for this tracker.";
    case "101":
      return "Mileage value is too large (devices usually accept 0–999,999 km).";
    case "102":
      return "Command format not recognised by the tracker.";
    case "103":
      return "Invalid mileage parameter — use whole kilometres (e.g. 48,280 km for 30,000 mi), not metres.";
    case "109":
      return "Tracker password incorrect.";
    default:
      return `Tracker returned error ${m[1]}.`;
  }
}

/** Device command responses often include plain-text success/failure even when commandstatus is 1. */
export function commandResponseLooksFailed(response: string): boolean {
  const r = response.trim().toLowerCase();
  if (!r) return false;
  return /\bfail|\berror|\boffline|\btimeout|\bunsupport|\binvalid|\bdenied|\brefus|\bnot\s+success/.test(r);
}

export function formatDeviceCommandError(response: string): string {
  const explained = explainDeviceCommandError(response);
  if (explained) return explained;
  const trimmed = response.trim();
  return trimmed || "Tracker rejected the set-mileage command.";
}

function describeApiError(code: number | undefined, message: string | undefined, fallback: string): string {
  const msg = message?.trim();
  switch (code) {
    case 10007:
      return "Permission denied by SmartCar Tracker (API code 10007). Open API is usually not enabled for this account - ask your tracker provider to enable Open API, then try again.";
    case 10014:
      return "SmartCar Tracker rejected the request time (API code 10014). Check the server clock and try again.";
    case 10016:
      return "This SmartCar Tracker account is blocked (API code 10016).";
    case 20001:
      return "SmartCar Tracker account or password is incorrect (API code 20001).";
    case 10006:
      return "Mileage value is out of range for the tracker (API code 10006). Try a smaller value or check the device manual.";
    case 20017:
      return "Tracker device is offline — set mileage when the device has a signal (API code 20017).";
    case 20018:
      return "Tracker rejected the set-mileage command (API code 20018). The device may be offline or busy.";
    case 20048:
      return "This tracker model does not support set mileage (API code 20048).";
    default:
      return msg || (code != null ? `${fallback} (code ${code})` : fallback);
  }
}

export type TrackerApiError = { ok: false; error: string; code?: number };
export type TrackerApiOk<T> = { ok: true; data: T };

export async function getAccessToken(
  account: string,
  password: string,
  cacheKey?: string,
): Promise<TrackerApiOk<string> | TrackerApiError> {
  const key = cacheKey ?? account;
  const cached = tokenCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAtMs > now + 60_000) {
    return { ok: true, data: cached.accessToken };
  }

  const time = Math.floor(now / 1000);
  const signature = signatureFor(password, time);
  const url = `${API_BASE}/api/authorization?time=${time}&account=${encodeURIComponent(account)}&signature=${signature}`;

  try {
    const json = await getJson(url);

    if (json.code !== 0) {
      return {
        ok: false,
        error: describeApiError(json.code, json.message, "Authorisation failed"),
        code: json.code,
      };
    }
    const record = json.record as { access_token?: string; expires_in?: number } | null;
    const token = record?.access_token?.trim();
    if (!token) {
      return { ok: false, error: "Authorisation returned no access token." };
    }
    const expiresIn = typeof record?.expires_in === "number" ? record.expires_in : 7200;
    // Refresh ~90 minutes as docs suggest (or sooner if token shorter)
    const refreshInSec = Math.min(Math.max(expiresIn - 600, 60), 90 * 60);
    tokenCache.set(key, { accessToken: token, expiresAtMs: now + refreshInSec * 1000 });
    return { ok: true, data: token };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Authorisation request failed.",
    };
  }
}

export function clearAccessTokenCache(cacheKey: string) {
  tokenCache.delete(cacheKey);
}

export async function listDevices(
  accessToken: string,
  account?: string,
): Promise<TrackerApiOk<TrackerDevice[]> | TrackerApiError> {
  const qs = new URLSearchParams({ access_token: accessToken });
  if (account) qs.set("account", account);
  try {
    const json = await getJson(`${API_BASE}/api/device/list?${qs}`);
    if (json.code !== 0) {
      return { ok: false, error: json.message || `Device list failed (code ${json.code})`, code: json.code };
    }
    const rows = Array.isArray(json.record) ? json.record : [];
    const devices: TrackerDevice[] = rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        imei: String(row.imei ?? "").trim(),
        devicename: String(row.devicename ?? "").trim(),
        platenumber: String(row.platenumber ?? "").trim(),
        devicetype: row.devicetype != null ? String(row.devicetype) : undefined,
      };
    });
    return { ok: true, data: devices.filter((d) => d.imei) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Device list request failed." };
  }
}

export async function getDevicesByImeis(
  accessToken: string,
  imeis: string[],
): Promise<TrackerApiOk<TrackerDevice[]> | TrackerApiError> {
  const unique = [...new Set(imeis.map((i) => i.trim()).filter(Boolean))];
  if (!unique.length) return { ok: true, data: [] };
  try {
    const qs = new URLSearchParams({ access_token: accessToken, imeis: unique.join(",") });
    const json = await getJson(`${API_BASE}/api/device/detail?${qs}`);
    if (json.code !== 0) {
      return { ok: false, error: json.message || `Device detail failed (code ${json.code})`, code: json.code };
    }
    const rows = Array.isArray(json.record) ? json.record : [];
    const devices: TrackerDevice[] = rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        imei: String(row.imei ?? "").trim(),
        devicename: String(row.devicename ?? "").trim(),
        platenumber: String(row.platenumber ?? "").trim(),
        devicetype: row.devicetype != null ? String(row.devicetype) : undefined,
      };
    });
    return { ok: true, data: devices.filter((d) => d.imei) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Device detail request failed." };
  }
}

export async function trackDevices(
  accessToken: string,
  imeis: string[],
): Promise<TrackerApiOk<TrackerTrackRecord[]> | TrackerApiError> {
  if (!imeis.length) return { ok: true, data: [] };
  const chunks: string[][] = [];
  for (let i = 0; i < imeis.length; i += 100) chunks.push(imeis.slice(i, i + 100));

  const all: TrackerTrackRecord[] = [];
  try {
    for (const chunk of chunks) {
      const qs = new URLSearchParams({
        access_token: accessToken,
        imeis: chunk.join(","),
      });
      const json = await getJson(`${API_BASE}/api/track?${qs}`);
      if (json.code !== 0) {
        return { ok: false, error: json.message || `Track failed (code ${json.code})`, code: json.code };
      }
      const rows = Array.isArray(json.record) ? json.record : [];
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        all.push({
          imei: String(row.imei ?? "").trim(),
          servertime: num(row.servertime),
          gpstime: num(row.gpstime),
          hearttime: num(row.hearttime),
          systemtime: num(row.systemtime),
          longitude: num(row.longitude),
          latitude: num(row.latitude),
          course: num(row.course),
          speed: num(row.speed),
          accstatus: num(row.accstatus),
          datastatus: num(row.datastatus),
          mileage: num(row.mileage),
          todaymileage: num(row.todaymileage),
          battery: num(row.battery),
          externalpower: row.externalpower != null ? String(row.externalpower) : undefined,
        });
      }
    }
    return { ok: true, data: all };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Track request failed." };
  }
}

/**
 * Mileage for many IMEIs. Queries per device so one subscription/data-window
 * limit cannot fail the whole report. Applies exclusive endtime caps and retries.
 */
export async function mileageReport(
  accessToken: string,
  imeis: string[],
  beginUnix: number,
  endUnix: number,
): Promise<TrackerApiOk<{ imei: string; mileageKm: number }[]> | TrackerApiError> {
  if (!imeis.length) return { ok: true, data: [] };

  const all: { imei: string; mileageKm: number }[] = [];
  let lastError: string | undefined;

  for (const imei of imeis) {
    const row = await mileageReportForImei(accessToken, imei, beginUnix, endUnix);
    if (row.ok) {
      all.push(row.data);
      continue;
    }
    lastError = row.error;
    // Skip devices that cannot be queried for this window; keep going.
  }

  if (!all.length && lastError) {
    return { ok: false, error: sanitizeMileageError(lastError) };
  }
  return { ok: true, data: all };
}

async function mileageReportForImei(
  accessToken: string,
  imei: string,
  beginUnix: number,
  endUnix: number,
): Promise<
  | { ok: true; data: { imei: string; mileageKm: number } }
  | { ok: false; error: string; code?: number }
> {
  let begin = beginUnix;
  let end = endUnix;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await mileageReportOnce(accessToken, [imei], begin, end);
    if (res.ok) {
      const hit = res.data.find((r) => r.imei === imei) ?? res.data[0];
      return {
        ok: true,
        data: { imei, mileageKm: hit?.mileageKm ?? 0 },
      };
    }

    const cap = parseMileageExclusiveCapUnix(res.error);
    if (cap == null) {
      return { ok: false, error: sanitizeMileageError(res.error), code: res.code };
    }
    // Need endtime strictly below the device cap.
    if (end < cap && attempt > 0) {
      return { ok: false, error: sanitizeMileageError(res.error), code: res.code };
    }
    const clamped = clampMileageWindowToExclusiveCap(begin, end, cap);
    if (!clamped || (clamped.endUnix === end && clamped.beginUnix === begin)) {
      return { ok: false, error: sanitizeMileageError(res.error), code: res.code };
    }
    begin = clamped.beginUnix;
    end = clamped.endUnix;
  }

  return {
    ok: false,
    error: "Mileage history is not available for this tracker’s current data window.",
  };
}

async function mileageReportOnce(
  accessToken: string,
  imeis: string[],
  beginUnix: number,
  endUnix: number,
): Promise<TrackerApiOk<{ imei: string; mileageKm: number }[]> | TrackerApiError> {
  const chunks: string[][] = [];
  for (let i = 0; i < imeis.length; i += 100) chunks.push(imeis.slice(i, i + 100));
  const all: { imei: string; mileageKm: number }[] = [];
  try {
    for (const chunk of chunks) {
      const qs = new URLSearchParams({
        access_token: accessToken,
        imeis: chunk.join(","),
        begintime: String(beginUnix),
        endtime: String(endUnix),
      });
      const json = await getJson(`${API_BASE}/api/device/mileage?${qs}`);
      if (json.code !== 0) {
        const raw = [json.message, typeof json.record === "string" ? json.record : null]
          .filter(Boolean)
          .join(" ");
        return {
          ok: false,
          error: raw || `Mileage report failed (code ${json.code})`,
          code: json.code,
        };
      }
      const rows = Array.isArray(json.record) ? json.record : [];
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        all.push({
          imei: String(row.imei ?? "").trim(),
          mileageKm: typeof row.mileage === "number" ? row.mileage : Number(row.mileage) || 0,
        });
      }
    }
    return { ok: true, data: all };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mileage report request failed." };
  }
}

/** API: “can only query data that is less than &lt;unix&gt;” → exclusive upper bound. */
export function parseMileageExclusiveCapUnix(message: string | undefined): number | null {
  if (!message) return null;
  const m = /less than\s+(\d{9,12})/i.exec(message);
  if (!m) return null;
  const cap = Number(m[1]);
  return Number.isFinite(cap) ? cap : null;
}

export function sanitizeMileageError(message: string | undefined): string {
  const raw = message?.trim() || "Mileage report failed.";
  if (
    /can only query data that is less than/i.test(raw) ||
    /parameter endtime error/i.test(raw) ||
    /less than\s+\d{9,12}/i.test(raw)
  ) {
    return "Mileage history is not available for the full period for one or more trackers. Check the device subscription or try again later.";
  }
  return raw
    .replace(/protrack365\.com/gi, "SmartCar Tracker")
    .replace(/\bprotrack\b/gi, "SmartCar Tracker")
    .replace(/\bimei\s+\d+/gi, "a tracker");
}

/**
 * Clamp a mileage window so endtime &lt; exclusiveCapUnix (half-hour aligned).
 * Preserves duration when possible; keeps span under the API 7-day max.
 */
export function clampMileageWindowToExclusiveCap(
  beginUnix: number,
  endUnix: number,
  exclusiveCapUnix: number,
): { beginUnix: number; endUnix: number } | null {
  // Snap down to a half-hour that is strictly before the exclusive cap.
  let end = exclusiveCapUnix - (exclusiveCapUnix % HALF_HOUR_SEC || HALF_HOUR_SEC);
  if (end >= exclusiveCapUnix) end -= HALF_HOUR_SEC;
  if (end <= 0) return null;

  const desiredSpan = Math.min(Math.max(endUnix - beginUnix, HALF_HOUR_SEC), SEVEN_DAYS_SEC - HALF_HOUR_SEC);
  let begin = end - desiredSpan;
  begin -= begin % HALF_HOUR_SEC;
  if (end - begin > SEVEN_DAYS_SEC) begin = end - (SEVEN_DAYS_SEC - HALF_HOUR_SEC);
  if (begin >= end) begin = end - HALF_HOUR_SEC;
  if (begin <= 0 || begin >= end) return null;
  return { beginUnix: begin, endUnix: end };
}

/** SET_MILEAGE — paramData mileage is km string; live track odometer reads metres. */
export async function setDeviceMileage(
  accessToken: string,
  imei: string,
  mileageKmString: string,
): Promise<TrackerApiOk<{ commandId: string; response: string }> | TrackerApiError> {
  const body = new URLSearchParams({
    access_token: accessToken,
    imei,
    command: "SET_MILEAGE",
    paramData: JSON.stringify({ mileage: mileageKmString }),
  });
  try {
    const send = await postForm(`${API_BASE}/api/command/send`, body);
    if (send.code !== 0) {
      return {
        ok: false,
        error: describeApiError(send.code, send.message, "Set mileage send failed"),
        code: send.code,
      };
    }
    const commandId = String((send.record as { commandid?: string } | null)?.commandid ?? "").trim();
    if (!commandId) return { ok: false, error: "No command id returned." };

    let lastResponse = "";
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const q = new URLSearchParams({ access_token: accessToken, commandid: commandId });
      const query = await postForm(`${API_BASE}/api/command/query`, q);
      if (query.code !== 0) continue;
      const rec = query.record as { response?: string; commandstatus?: number } | null;
      lastResponse = rec?.response ?? "";
      if (rec?.commandstatus === 1) {
        if (commandResponseLooksFailed(lastResponse)) {
          return {
            ok: false,
            error: formatDeviceCommandError(lastResponse),
          };
        }
        return { ok: true, data: { commandId, response: lastResponse || "OK" } };
      }
    }
    return { ok: false, error: lastResponse || "Set mileage timed out waiting for device response." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Set mileage request failed." };
  }
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Snap a Date to the previous :00 or :30 minute mark (API requirement). */
export function snapToHalfHourUnix(date: Date): number {
  const d = new Date(date.getTime());
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  if (m < 30) d.setMinutes(0);
  else d.setMinutes(30);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Last ~7 days window ending at now, snapped for SmartCar Tracker API 2.14.
 * endtime is exclusive; keep span strictly under 7 days (API maximum).
 */
export function weeklyMileageWindowUnix(now = new Date()): { beginUnix: number; endUnix: number } {
  const end = snapToHalfHourUnix(now);
  // Prefer just under 7 days so snap + exclusive end never exceeds the API max.
  let begin = snapToHalfHourUnix(new Date((end - (SEVEN_DAYS_SEC - HALF_HOUR_SEC)) * 1000));
  if (end - begin > SEVEN_DAYS_SEC) {
    begin = end - (SEVEN_DAYS_SEC - HALF_HOUR_SEC);
  }
  if (begin >= end) {
    begin = end - HALF_HOUR_SEC;
  }
  return { beginUnix: begin, endUnix: end };
}

export const DATA_STATUS_LABELS: Record<number, string> = {
  1: "Never online",
  2: "Online",
  3: "Expired",
  4: "Offline",
  5: "Blocked",
};

export function dataStatusLabel(status: number | undefined): string {
  if (status == null) return "Unknown";
  return DATA_STATUS_LABELS[status] ?? `Status ${status}`;
}

export function accStatusLabel(status: number | undefined): string {
  if (status === 1) return "Ignition on";
  if (status === 0) return "Ignition off";
  return "Ignition unknown";
}
