import { createHash } from "crypto";
import type { TrackerDevice } from "@/lib/fleet-tracking/mapping";

const API_BASE = "https://api.protrack365.com";

type TokenCacheEntry = { accessToken: string; expiresAtMs: number };
const tokenCache = new Map<string, TokenCacheEntry>();

export type ProtrackTrackRecord = {
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
    default:
      return msg || (code != null ? `${fallback} (code ${code})` : fallback);
  }
}

/** Safe for logs / UI sharing: never includes password or signature. */
export type ProtrackDebugPayload = {
  endpoint: string;
  account: string;
  time: number;
  httpOk?: boolean;
  response: unknown;
};

export type ProtrackApiError = { ok: false; error: string; code?: number; debug?: ProtrackDebugPayload };
export type ProtrackOk<T> = { ok: true; data: T; debug?: ProtrackDebugPayload };

function logApiDebug(label: string, debug: ProtrackDebugPayload) {
  console.info(`[fleet-tracking] ${label}`, JSON.stringify(debug, null, 2));
}

export async function getAccessToken(
  account: string,
  password: string,
  cacheKey?: string,
): Promise<ProtrackOk<string> | ProtrackApiError> {
  const key = cacheKey ?? account;
  const cached = tokenCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAtMs > now + 60_000) {
    return { ok: true, data: cached.accessToken };
  }

  const time = Math.floor(now / 1000);
  const signature = signatureFor(password, time);
  const url = `${API_BASE}/api/authorization?time=${time}&account=${encodeURIComponent(account)}&signature=${signature}`;
  const debugBase = {
    endpoint: `${API_BASE}/api/authorization`,
    account,
    time,
  };

  try {
    const json = await getJson(url);
    const debug: ProtrackDebugPayload = {
      ...debugBase,
      httpOk: true,
      response: redactAuthRecord(json),
    };
    logApiDebug("authorization response", debug);

    if (json.code !== 0) {
      return {
        ok: false,
        error: describeApiError(json.code, json.message, "Authorisation failed"),
        code: json.code,
        debug,
      };
    }
    const record = json.record as { access_token?: string; expires_in?: number } | null;
    const token = record?.access_token?.trim();
    if (!token) {
      return { ok: false, error: "Authorisation returned no access token.", debug };
    }
    const expiresIn = typeof record?.expires_in === "number" ? record.expires_in : 7200;
    // Refresh ~90 minutes as docs suggest (or sooner if token shorter)
    const refreshInSec = Math.min(Math.max(expiresIn - 600, 60), 90 * 60);
    tokenCache.set(key, { accessToken: token, expiresAtMs: now + refreshInSec * 1000 });
    return { ok: true, data: token, debug };
  } catch (e) {
    const debug: ProtrackDebugPayload = {
      ...debugBase,
      httpOk: false,
      response: { error: e instanceof Error ? e.message : "Authorisation request failed." },
    };
    logApiDebug("authorization error", debug);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Authorisation request failed.",
      debug,
    };
  }
}

function redactAuthRecord(json: { code: number; message?: string; record?: unknown }) {
  if (!json.record || typeof json.record !== "object") return json;
  const record = { ...(json.record as Record<string, unknown>) };
  if (typeof record.access_token === "string" && record.access_token) {
    record.access_token = `${record.access_token.slice(0, 6)}…(redacted)`;
  }
  return { ...json, record };
}

export function clearAccessTokenCache(cacheKey: string) {
  tokenCache.delete(cacheKey);
}

export async function listDevices(
  accessToken: string,
  account?: string,
): Promise<ProtrackOk<TrackerDevice[]> | ProtrackApiError> {
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

export async function trackDevices(
  accessToken: string,
  imeis: string[],
): Promise<ProtrackOk<ProtrackTrackRecord[]> | ProtrackApiError> {
  if (!imeis.length) return { ok: true, data: [] };
  const chunks: string[][] = [];
  for (let i = 0; i < imeis.length; i += 100) chunks.push(imeis.slice(i, i + 100));

  const all: ProtrackTrackRecord[] = [];
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

export async function mileageReport(
  accessToken: string,
  imeis: string[],
  beginUnix: number,
  endUnix: number,
): Promise<ProtrackOk<{ imei: string; mileageKm: number }[]> | ProtrackApiError> {
  if (!imeis.length) return { ok: true, data: [] };
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
        return { ok: false, error: json.message || `Mileage report failed (code ${json.code})`, code: json.code };
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

/** SET_MILEAGE — mileageKm is what the API expects (plan: miles converted to km). */
export async function setDeviceMileage(
  accessToken: string,
  imei: string,
  mileageKm: number,
): Promise<ProtrackOk<{ commandId: string; response: string }> | ProtrackApiError> {
  const body = new URLSearchParams({
    access_token: accessToken,
    imei,
    command: "SET_MILEAGE",
    paramData: JSON.stringify({ mileage: String(Math.round(mileageKm)) }),
  });
  try {
    const send = await postForm(`${API_BASE}/api/command/send`, body);
    if (send.code !== 0) {
      return { ok: false, error: send.message || `Set mileage send failed (code ${send.code})`, code: send.code };
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

/** Last 7 days window ending at now, snapped for API 2.14 (Europe/London wall clock via local Date). */
export function weeklyMileageWindowUnix(now = new Date()): { beginUnix: number; endUnix: number } {
  const end = snapToHalfHourUnix(now);
  const beginDate = new Date(end * 1000 - 7 * 24 * 60 * 60 * 1000);
  const begin = snapToHalfHourUnix(beginDate);
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
