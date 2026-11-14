import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getAppBaseUrl } from "@/lib/app-base-url";
import { merchantOrdersApiKey } from "@/lib/merchant-orders/auth";

const TOKEN_VERSION = 1;

function statusSecret(): string {
  return (
    process.env.MERCHANT_ORDERS_STATUS_SECRET?.trim() ||
    merchantOrdersApiKey()
  );
}

function aesKey(): Buffer | null {
  const secret = statusSecret();
  if (!secret) return null;
  return createHash("sha256").update(secret, "utf8").digest();
}

/** Opaque token for a Cosmo Order.id — ciphertext, not a plain id. */
export function sealMerchantOrderStatusToken(orderId: string): string | null {
  const key = aesKey();
  const id = orderId.trim();
  if (!key || !id) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify({ v: TOKEN_VERSION, o: id }), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function openMerchantOrderStatusToken(token: string): string | null {
  const key = aesKey();
  const raw = token.trim();
  if (!key || !raw) return null;

  let packed: Buffer;
  try {
    packed = Buffer.from(raw, "base64url");
  } catch {
    return null;
  }
  if (packed.length < 12 + 16 + 1) return null;

  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plaintext) as { v?: unknown; o?: unknown };
    if (parsed.v !== TOKEN_VERSION || typeof parsed.o !== "string" || !parsed.o.trim()) {
      return null;
    }
    return parsed.o.trim();
  } catch {
    return null;
  }
}

export function buildMerchantOrderStatusUrl(orderId: string): string {
  const token = sealMerchantOrderStatusToken(orderId);
  if (!token) return "";
  return `${getAppBaseUrl()}/o/${token}`;
}
