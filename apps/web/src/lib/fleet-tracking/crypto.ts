import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "ft1";

function encryptionKey(): Buffer {
  const raw = process.env.FLEET_TRACKING_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "FLEET_TRACKING_ENCRYPTION_KEY is not set. Add a long random secret to encrypt Fleet Tracking API passwords.",
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Encrypt a plaintext API password for storage. Returns `ft1:<ivHex>:<tagHex>:<cipherHex>`. */
export function encryptFleetTrackingPassword(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptFleetTrackingPassword(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Invalid stored Fleet Tracking password format.");
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
