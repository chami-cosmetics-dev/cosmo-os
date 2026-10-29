import { Prisma } from "@prisma/client";

import {
  ingestPurchaseInvoiceFromWebhook,
  ingestPurchaseReceiptFromWebhook,
  ingestSupplierStockReturnFromWebhook,
  resolveGrnWebhookInstanceSecret,
} from "@/lib/grn";
import { unwrapErpWebhookPayload } from "@/lib/erpnext-customer-display-name";
import { prisma } from "@/lib/prisma";
import {
  erpnextPurchaseInvoiceWebhookSchema,
  erpnextPurchaseReceiptWebhookSchema,
  erpnextSupplierStockReturnWebhookSchema,
} from "@/lib/validation/erpnext-grn";

export type ErpGrnWebhookType = "purchase_receipt" | "supplier_stock_return" | "purchase_invoice";

type ErpGrnWebhookResult = {
  ok: boolean;
  status?: number;
  error?: string;
  ignored?: boolean;
  pending?: boolean;
};

export class ErpGrnWebhookError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "ErpGrnWebhookError";
    this.status = status;
    this.details = details;
  }
}

function payloadRecord(rawPayload: unknown) {
  const unwrapped = unwrapErpWebhookPayload(rawPayload);
  return unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped)
    ? (unwrapped as Record<string, unknown>)
    : {};
}

export function erpGrnWebhookDocumentTypeLabel(type: ErpGrnWebhookType) {
  if (type === "purchase_receipt") return "Purchase Receipt";
  if (type === "supplier_stock_return") return "Supplier Stock Return";
  return "Purchase Invoice";
}

export function normalizeErpGrnWebhookType(value: string): ErpGrnWebhookType | null {
  if (value === "purchase_receipt" || value === "supplier_stock_return" || value === "purchase_invoice") {
    return value;
  }
  return null;
}

async function createWebhookRecord(type: ErpGrnWebhookType, endpoint: string, rawPayload: unknown) {
  const payload = payloadRecord(rawPayload);
  const erpCompany = typeof payload.company === "string" ? payload.company.trim() : null;
  const documentName = typeof payload.name === "string" ? payload.name.trim() : null;
  const location = erpCompany
    ? await prisma.companyLocation.findFirst({
        where: { erpnextCompany: erpCompany },
        select: { id: true, companyId: true, erpnextInstanceId: true },
      })
    : null;

  try {
    return await prisma.erpGrnWebhook.create({
      data: {
        companyId: location?.companyId ?? null,
        companyLocationId: location?.id ?? null,
        erpnextInstanceId: location?.erpnextInstanceId ?? null,
        documentType: type,
        documentName,
        erpCompany,
        endpoint,
        rawPayload: rawPayload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
  } catch (error) {
    console.error("[ERP GRN webhook] Could not persist webhook receipt", {
      type,
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function markWebhookFailed(id: string | null, error: unknown, details?: unknown) {
  if (!id) return;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 10000);
  const stack = error instanceof Error ? error.stack : details ? JSON.stringify(details) : null;
  try {
    await prisma.erpGrnWebhook.update({
      where: { id },
      data: {
        status: "failed",
        errorMessage: message,
        errorStack: stack?.slice(0, 10000) ?? null,
        resolvedAt: null,
        lastAttemptAt: new Date(),
      },
    });
  } catch (updateError) {
    console.error("[ERP GRN webhook] Could not persist webhook failure", {
      id,
      error: updateError instanceof Error ? updateError.message : String(updateError),
    });
  }
}

async function markWebhookProcessed(id: string | null) {
  if (!id) return;
  try {
    await prisma.erpGrnWebhook.update({
      where: { id },
      data: {
        status: "processed",
        errorMessage: null,
        errorStack: null,
        resolvedAt: new Date(),
        lastAttemptAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[ERP GRN webhook] Could not persist webhook success", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function markWebhookAttempt(id: string) {
  await prisma.erpGrnWebhook.update({
    where: { id },
    data: {
      status: "received",
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
      resolvedAt: null,
    },
  });
}

export async function processErpGrnWebhookPayload(type: ErpGrnWebhookType, rawPayload: unknown): Promise<ErpGrnWebhookResult> {
  const unwrapped = unwrapErpWebhookPayload(rawPayload) ?? rawPayload;
  if (type === "purchase_receipt") {
    const parsed = erpnextPurchaseReceiptWebhookSchema.safeParse(unwrapped);
    if (!parsed.success) {
      throw new ErpGrnWebhookError("Invalid payload", 400, parsed.error.flatten());
    }
    const result = await ingestPurchaseReceiptFromWebhook(parsed.data, rawPayload);
    if (!result.ok) throw new ErpGrnWebhookError(result.error, result.status);
    return result;
  }
  if (type === "supplier_stock_return") {
    const parsed = erpnextSupplierStockReturnWebhookSchema.safeParse(unwrapped);
    if (!parsed.success) {
      throw new ErpGrnWebhookError("Invalid payload", 400, parsed.error.flatten());
    }
    const result = await ingestSupplierStockReturnFromWebhook(parsed.data, rawPayload);
    if (!result.ok) throw new ErpGrnWebhookError(result.error, result.status);
    return result;
  }
  const parsed = erpnextPurchaseInvoiceWebhookSchema.safeParse(unwrapped);
  if (!parsed.success) {
    throw new ErpGrnWebhookError("Invalid payload", 400, parsed.error.flatten());
  }
  const result = await ingestPurchaseInvoiceFromWebhook(parsed.data, rawPayload);
  if (!result.ok) throw new ErpGrnWebhookError(result.error, result.status);
  return result;
}

export async function handleIncomingErpGrnWebhook(input: {
  type: ErpGrnWebhookType;
  endpoint: string;
  incomingSecret: string;
  rawPayload: unknown;
}) {
  const record = await createWebhookRecord(input.type, input.endpoint, input.rawPayload);
  const payload = payloadRecord(input.rawPayload);
  const company = typeof payload.company === "string" ? payload.company.trim() : "";

  const instanceSecret = await resolveGrnWebhookInstanceSecret(company);
  if (!instanceSecret?.secret || input.incomingSecret !== instanceSecret.secret) {
    const error = new ErpGrnWebhookError("Unauthorized", 401);
    await markWebhookFailed(record?.id ?? null, error);
    return { status: 401, body: { error: error.message, webhookId: record?.id ?? null } };
  }

  try {
    const result = await processErpGrnWebhookPayload(input.type, input.rawPayload);
    await markWebhookProcessed(record?.id ?? null);
    return { status: 200, body: { ...result, webhookId: record?.id ?? null } };
  } catch (error) {
    const typedError = error instanceof ErpGrnWebhookError
      ? error
      : new ErpGrnWebhookError(error instanceof Error ? error.message : String(error));
    await markWebhookFailed(record?.id ?? null, typedError, typedError.details);
    return {
      status: typedError.status,
      body: {
        error: typedError.message,
        ...(typedError.details ? { details: typedError.details } : {}),
        webhookId: record?.id ?? null,
      },
    };
  }
}

export async function retryErpGrnWebhook(id: string) {
  const record = await prisma.erpGrnWebhook.findUnique({ where: { id } });
  if (!record) throw new ErpGrnWebhookError("ERP webhook not found", 404);
  const type = normalizeErpGrnWebhookType(record.documentType);
  if (!type) throw new ErpGrnWebhookError("Unsupported ERP webhook type", 400);

  await markWebhookAttempt(record.id);
  try {
    const result = await processErpGrnWebhookPayload(type, record.rawPayload);
    await markWebhookProcessed(record.id);
    return result;
  } catch (error) {
    const typedError = error instanceof ErpGrnWebhookError
      ? error
      : new ErpGrnWebhookError(error instanceof Error ? error.message : String(error));
    await markWebhookFailed(record.id, typedError, typedError.details);
    throw typedError;
  }
}
