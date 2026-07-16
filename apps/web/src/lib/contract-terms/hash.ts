import { createHash } from "crypto";

export function hashTermsBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}
