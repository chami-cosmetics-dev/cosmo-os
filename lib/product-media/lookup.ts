import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const sku = z.string().min(1).max(200).refine((value) => value.trim() === value);
const requestSchema = z.strictObject({
  contractVersion: z.literal("cosmo-product-media.v1"),
  requestId: z.string().uuid(),
  skus: z.array(sku).min(1).max(100).refine((values) => new Set(values).size === values.length),
});
const bindingSchema = z.strictObject({
  purpose: z.literal("product-media:read"),
  destinationCompanyId: id,
  companyId: id,
  locationId: id,
  storeHostname: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/),
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  expiresAt: z.string().datetime(),
});
type Binding = z.infer<typeof bindingSchema>;
type Row = {
  id: string; sku: string | null; shopifyProductId: string; shopifyVariantId: string;
  imageUrl: string | null; updatedAt: Date;
};
const MAX_BODY = 128 * 1024;
const MAX_CANDIDATES = 5;
const verifiedId = /^[1-9][0-9]{0,29}$/;

function readBinding(config: string | undefined): Binding | null {
  try {
    return bindingSchema.parse(JSON.parse(config ?? ""));
  } catch {
    return null;
  }
}

async function readBody(request: Request) {
  if (!request.body) return null;
  if (Number(request.headers.get("content-length")) > MAX_BODY) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_BODY) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function photoUrl(value: string | null) {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "cdn.shopify.com" &&
      !url.username && !url.password && !url.port && !url.hash ? url.href : null;
  } catch {
    return null;
  }
}

export function createProductMediaHandler(deps: {
  config: () => string | undefined;
  now?: () => number;
  load: (binding: Binding, skus: string[]) => Promise<Row[] | null>;
}) {
  let windowStart = 0;
  let requestCount = 0;

  return async (request: Request) => {
    const headers = { "Cache-Control": "no-store" };
    const fail = (status: number, code: string) => Response.json({ code }, { status, headers });
    const binding = readBinding(deps.config());
    const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get("authorization") ?? "")?.[1];
    const now = deps.now?.() ?? Date.now();
    if (!token || !binding || Date.parse(binding.expiresAt) <= now ||
        !timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(binding.tokenHash, "hex"))) {
      return fail(401, "UNAUTHORIZED");
    }
    if (request.headers.get("x-portal-company-id") !== binding.destinationCompanyId) {
      return fail(403, "BINDING_MISMATCH");
    }
    if (now - windowStart >= 60_000) {
      windowStart = now;
      requestCount = 0;
    }
    if (++requestCount > 30) return Response.json({ code: "THROTTLED" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return fail(422, "INVALID_INPUT");
    let raw: string | null;
    try {
      raw = await readBody(request);
    } catch {
      return fail(422, "INVALID_INPUT");
    }
    if (raw === null) return fail(413, "BODY_TOO_LARGE");
    let input: z.infer<typeof requestSchema>;
    try {
      input = requestSchema.parse(JSON.parse(raw));
    } catch {
      return fail(422, "INVALID_INPUT");
    }

    try {
      const rows = await deps.load(binding, input.skus);
      if (!rows) return fail(403, "BINDING_MISMATCH");
      const items = input.skus.map((itemSku) => {
        const matches = rows.filter((row) => row.sku === itemSku && verifiedId.test(row.shopifyProductId) && verifiedId.test(row.shopifyVariantId));
        const candidates = matches.slice(0, MAX_CANDIDATES).map((row) => ({
          cosmoProductItemId: row.id, shopifyProductId: row.shopifyProductId,
          shopifyVariantId: row.shopifyVariantId, imageUrl: photoUrl(row.imageUrl),
          imageAlt: null, sourceUpdatedAt: row.updatedAt.toISOString(),
        }));
        const status = matches.length > 1 ? "AMBIGUOUS" : candidates.length === 0 ? "NOT_FOUND"
          : candidates[0].imageUrl ? "MATCHED" : "NO_PHOTO";
        return { sku: itemSku, status, candidates, truncated: matches.length > MAX_CANDIDATES };
      });
      return Response.json({
        contractVersion: input.contractVersion, requestId: input.requestId,
        source: { companyId: binding.companyId, locationId: binding.locationId, storeHostname: binding.storeHostname },
        items,
      }, { headers });
    } catch {
      return fail(503, "UNAVAILABLE");
    }
  };
}
