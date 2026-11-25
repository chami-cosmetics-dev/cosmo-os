import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { PurchaseHistoryRecord } from "@/lib/osf/purchase-history";

const version = "cosmo-purchase-history.v1";
const text = z.string().trim().min(1).max(200);
const bindingSchema = z.object({
  purpose: z.literal("purchase-history:read"),
  companyId: text,
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime(),
  erpCompanies: z.record(text, z.union([text, z.array(text).min(1).max(20)])),
});
const requestSchema = z.strictObject({
  requestId: z.uuid(),
  sku: text,
  itemCode: text,
  instanceId: text,
  erpCompany: text.optional(),
  from: z.iso.date(),
  to: z.iso.date(),
  offset: z.coerce.number().int().min(0).max(250).default(0),
}).refine(({ from, to }) => to >= from && Date.parse(to) - Date.parse(from) <= 366 * 86_400_000);

type Scope = {
  companyId: string; erpCompany: string; instanceId: string;
  sku: string; itemCode: string; from: string; to: string;
};

export type PurchaseHistoryResult =
  | { status: "MAPPING_UNAVAILABLE" | "MAPPING_AMBIGUOUS" }
  | { status: "OK"; instanceLabel: string; records: PurchaseHistoryRecord[]; truncated: boolean; hasUnusableRows: boolean };

export function createPurchaseHistoryHandler(deps: {
  config: () => string | undefined;
  load: (scope: Scope) => Promise<PurchaseHistoryResult>;
  now?: () => number;
}) {
  return async (request: Request) => {
    const respond = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    const destination = request.headers.get("x-portal-company-id") ?? "";
    const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get("authorization") ?? "")?.[1];
    const now = deps.now?.() ?? Date.now();
    const binding = (() => {
      try {
        const decoded: unknown = JSON.parse(deps.config() ?? "{}");
        const bindings = z.record(text, bindingSchema).parse(decoded);
        return Object.hasOwn(bindings, destination) ? bindings[destination] : null;
      } catch { return null; }
    })();
    if (!token || !binding || Date.parse(binding.expiresAt) <= now ||
        !timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(binding.tokenHash, "hex"))) {
      return respond({ code: "UNAUTHORIZED" }, 401);
    }

    const input = requestSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!input.success) return respond({ code: "INVALID_INPUT" }, 422);
    const { requestId, sku, itemCode, instanceId, from, to, offset } = input.data;
    if (!Object.hasOwn(binding.erpCompanies, instanceId)) return respond({ code: "BINDING_MISMATCH" }, 403);
    const configured = binding.erpCompanies[instanceId];
    const companies = [...new Set(Array.isArray(configured) ? configured : [configured])];
    if (input.data.erpCompany && !companies.includes(input.data.erpCompany)) {
      return respond({ code: "BINDING_MISMATCH" }, 403);
    }
    const identity = { contractVersion: version, requestId, companyId: binding.companyId, instanceId, sku, itemCode, from, to };
    const erpCompany = input.data.erpCompany ?? (companies.length === 1 ? companies[0] : null);
    if (!erpCompany) return respond({ ...identity, status: "SELECT_COMPANY", companies });

    try {
      const result = await deps.load({ companyId: binding.companyId, erpCompany, instanceId, sku, itemCode, from, to });
      if (result.status !== "OK") return respond({ ...identity, status: result.status });
      const end = offset + 25;
      return respond({
        ...identity,
        status: "OK",
        erpCompany, companies,
        instanceLabel: result.instanceLabel,
        retrievedAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
        records: result.records.slice(offset, end),
        nextOffset: end < result.records.length ? end : null,
        truncated: result.truncated,
        hasUnusableRows: result.hasUnusableRows,
        ...summaries(result.records),
      });
    } catch {
      return respond({ code: "HISTORY_UNAVAILABLE" }, 502);
    }
  };
}

function decimalLess(left: string, right: string): boolean {
  const [a, af = ""] = left.split(".");
  const [b, bf = ""] = right.split(".");
  if (a.length !== b.length) return a.length < b.length;
  if (a !== b) return a < b;
  const scale = Math.max(af.length, bf.length);
  return af.padEnd(scale, "0") < bf.padEnd(scale, "0");
}

export function summaries(records: PurchaseHistoryRecord[]) {
  const latest = new Map<string, PurchaseHistoryRecord>();
  const lowest = new Map<string, PurchaseHistoryRecord>();
  for (const record of records) {
    if (record.unitPrice === null) continue;
    if (!latest.has(record.supplierId)) latest.set(record.supplierId, record);
    if (record.priceBasis !== "NET_BEFORE_TAX_NO_HEADER_DISCOUNT" ||
      !record.currency || !record.uom || !record.stockUom || !record.conversionFactor) continue;
    const key = JSON.stringify([record.currency, record.uom, record.stockUom, record.conversionFactor, record.priceBasis]);
    const prior = lowest.get(key);
    if (!prior || decimalLess(record.unitPrice, prior.unitPrice!)) lowest.set(key, record);
  }
  return { latest: [...latest.values()], lowest: [...lowest.values()] };
}
