import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function hashSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Six-digit numeric OTP. */
export function generateOtp(): string {
  const n = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
  return String(n).padStart(6, "0");
}

export function safeEqualHash(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
