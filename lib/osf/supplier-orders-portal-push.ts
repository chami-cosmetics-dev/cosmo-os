import "server-only";

import { randomUUID } from "node:crypto";

import { computeTotalOrderQtyForSkus } from "@/lib/osf/supplier-orders-reorder";
import type { WorkingOrderRow } from "@/lib/osf/supplier-orders-draft";
import { prisma } from "@/lib/prisma";

export const COSMO_OSF_CONTRACT_VERSION = "cosmo-osf-push.v1" as const;

export type PortalPushSuccess = {
  importId: string;
  status: string;
  replay: boolean;
  deepLinkPath: string;
  deepLinkUrl: string;
  summary: unknown;
  requirements: unknown;
};

export class SupplierPortalPushError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "SupplierPortalPushError";
    this.status = status;
    this.details = details;
  }
}

function portalConfig() {
  const baseUrl = (process.env.SUPPLIER_PORTAL_BASE_URL ?? "").trim().replace(/\/$/, "");
  const token = (process.env.SUPPLIER_PORTAL_INTEGRATION_TOKEN ?? "").trim();
  if (!baseUrl || !token) {
    throw new SupplierPortalPushError(
      "Supplier Portal integration is not configured (SUPPLIER_PORTAL_BASE_URL / SUPPLIER_PORTAL_INTEGRATION_TOKEN).",
      503,
    );
  }
  return { baseUrl, token };
}

/**
 * Build cosmo-osf-push.v1 payload from OSF supplier-orders draft rows.
 * TOTAL ORDER QTY is recomputed server-side; allocations become requestSuggestions.
 */
export async function buildOsfPortalPushPayload(args: {
  companyId: string;
  actorUserId: string;
  actorEmail?: string | null;
  rows: WorkingOrderRow[];
  brandFilterVendorId?: string | null;
  priorityFilter?: string | null;
  idempotencyKey?: string;
}) {
  const skus = [...new Set(args.rows.map((r) => r.sku.trim()).filter(Boolean))];
  if (skus.length === 0) {
    throw new SupplierPortalPushError("No SKUs to send.", 400);
  }

  const [qtyMap, productRows, suppliers] = await Promise.all([
    computeTotalOrderQtyForSkus(args.companyId, skus),
    prisma.productItem.findMany({
      where: {
        companyId: args.companyId,
        sku: { in: skus },
        status: { not: "archived" },
      },
      select: {
        sku: true,
        productTitle: true,
        barcode: true,
        vendorId: true,
        erp1ProductPriority: true,
        erp2ProductPriority: true,
        vendor: { select: { id: true, name: true } },
      },
      orderBy: [{ sku: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.supplier.findMany({
      where: { companyId: args.companyId },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const productBySku = new Map<string, (typeof productRows)[number]>();
  for (const row of productRows) {
    if (!row.sku || productBySku.has(row.sku)) continue;
    productBySku.set(row.sku, row);
  }
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  const missingBrand: string[] = [];
  const items = args.rows.map((row) => {
    const sku = row.sku.trim();
    const product = productBySku.get(sku);
    if (!product?.vendor?.id || !product.vendor.name) {
      missingBrand.push(sku);
    }
    const totalOrderQty = qtyMap.get(sku) ?? 0;
    return {
      lineKey: sku,
      sku,
      description: product?.productTitle?.trim() || row.description || sku,
      barcode: product?.barcode ?? undefined,
      brand: {
        cosmoVendorId: product?.vendor?.id ?? "unknown",
        name: product?.vendor?.name ?? "Unknown brand",
      },
      priorities: {
        erp1: product?.erp1ProductPriority ?? null,
        erp2: product?.erp2ProductPriority ?? null,
      },
      quantity: { totalOrderQty },
    };
  });

  if (missingBrand.length > 0) {
    throw new SupplierPortalPushError(
      `Cannot resolve Cosmo brand/vendor for SKU(s): ${missingBrand.slice(0, 10).join(", ")}`,
      400,
      { skus: missingBrand },
    );
  }

  const requestSuggestions: Array<{
    lineKey: string;
    cosmoSupplierId: string;
    cosmoSupplierCode?: string;
    cosmoSupplierName: string;
    suggestedRequestQty: number;
  }> = [];

  for (const row of args.rows) {
    const lineKey = row.sku.trim();
    for (const allocation of row.allocations) {
      if (!(allocation.qty > 0)) continue;
      const supplierId = allocation.supplierId?.trim();
      if (!supplierId) {
        throw new SupplierPortalPushError(
          `Allocation for ${lineKey} is missing Cosmo supplier id. Re-select the supplier.`,
          400,
        );
      }
      const supplier = supplierById.get(supplierId);
      requestSuggestions.push({
        lineKey,
        cosmoSupplierId: supplierId,
        cosmoSupplierCode: supplier?.code,
        cosmoSupplierName: supplier?.name || allocation.supplierName,
        suggestedRequestQty: allocation.qty,
      });
    }
  }

  const idempotencyKey = args.idempotencyKey?.trim() || randomUUID();
  const brandFilter = args.brandFilterVendorId
    ? { cosmoVendorId: args.brandFilterVendorId }
    : undefined;

  return {
    idempotencyKey,
    payload: {
      contractVersion: COSMO_OSF_CONTRACT_VERSION,
      idempotencyKey,
      source: {
        system: "cosmo-os" as const,
        cosmoCompanyId: args.companyId,
        sentAt: new Date().toISOString(),
        actorUserId: args.actorUserId,
        actorEmail: args.actorEmail ?? undefined,
      },
      selection: {
        mode: "SUPPLIER_ORDERS_SELECTION" as const,
        brandFilter,
        priorityFilter: args.priorityFilter?.trim() || undefined,
      },
      items,
      requestSuggestions,
    },
  };
}

export async function pushOsfDraftToSupplierPortal(args: {
  companyId: string;
  actorUserId: string;
  actorEmail?: string | null;
  rows: WorkingOrderRow[];
  brandFilterVendorId?: string | null;
  priorityFilter?: string | null;
  idempotencyKey?: string;
}): Promise<PortalPushSuccess> {
  const { baseUrl, token } = portalConfig();
  const built = await buildOsfPortalPushPayload(args);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/integrations/cosmo/v1/requirement-imports`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": built.idempotencyKey,
        "X-Contract-Version": COSMO_OSF_CONTRACT_VERSION,
      },
      body: JSON.stringify(built.payload),
      signal: controller.signal,
    });
  } catch (err) {
    throw new SupplierPortalPushError(
      err instanceof Error && err.name === "AbortError"
        ? "Supplier Portal request timed out."
        : "Could not reach Supplier Portal.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message =
      (typeof json?.error === "string" && json.error) ||
      (typeof json?.message === "string" && json.message) ||
      `Supplier Portal rejected the send (${response.status}).`;
    throw new SupplierPortalPushError(message, response.status, json);
  }

  const importId = typeof json?.importId === "string" ? json.importId : "";
  const deepLinkPath =
    typeof json?.deepLinkPath === "string"
      ? json.deepLinkPath
      : importId
        ? `/staff/osf-imports/${importId}`
        : "";
  if (!importId || !deepLinkPath) {
    throw new SupplierPortalPushError(
      "Supplier Portal returned an incomplete success response.",
      502,
      json,
    );
  }

  return {
    importId,
    status: typeof json?.status === "string" ? json.status : "UNKNOWN",
    replay: Boolean(json?.replay),
    deepLinkPath,
    deepLinkUrl: `${baseUrl}${deepLinkPath.startsWith("/") ? "" : "/"}${deepLinkPath}`,
    summary: json?.summary ?? null,
    requirements: json?.requirements ?? null,
  };
}
