import type { ErpnextInstance } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { createNotification } from "@/lib/approval-workflow";
import { getAppBaseUrl } from "@/lib/app-base-url";
import {
  findOrderForErpInvoiceReference,
  isErpReturnSalesInvoice,
  isErpSalesInvoiceCreditNoted,
} from "@/lib/erp-credit-note-order-sync";
import { getErpConfig } from "@/lib/erpnext-sync";
import { prisma } from "@/lib/prisma";
import type { ErpnextSalesInvoiceWebhookPayload } from "@/lib/validation/erpnext-sales-invoice";

const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_LIMIT_PER_INSTANCE = 25;

type ErpSalesInvoiceListRow = {
  name: string;
  company: string;
  po_no?: string | null;
  is_return?: number | null;
  return_against?: string | null;
  grand_total?: number | null;
  status?: string | null;
  docstatus?: number | null;
  is_pos?: number | null;
  creation?: string | null;
};

type ErpSalesInvoiceDocument = ErpnextSalesInvoiceWebhookPayload & Record<string, unknown>;

export type ErpMissingOrderAuditResult = {
  instancesChecked: number;
  invoicesScanned: number;
  missingFound: number;
  imported: number;
  stillMissing: number;
  failed: Array<{ invoiceName: string; reason: string }>;
};

function lookbackDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function erpnextFetch<T>(
  cfg: ReturnType<typeof getErpConfig>,
  path: string,
): Promise<T | null> {
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) return null;
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}${path}`, {
      headers: { Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export function mapErpSalesInvoiceToWebhookPayload(
  si: ErpSalesInvoiceDocument,
): ErpnextSalesInvoiceWebhookPayload {
  return {
    name: si.name,
    customer: si.customer,
    customer_name: si.customer_name ?? null,
    company: si.company,
    posting_date: si.posting_date ?? null,
    grand_total: si.grand_total ?? null,
    net_total: si.net_total ?? null,
    discount_amount: si.discount_amount ?? null,
    po_no: si.po_no ?? null,
    currency: si.currency ?? null,
    docstatus: si.docstatus ?? null,
    status: si.status ?? null,
    outstanding_amount: si.outstanding_amount ?? null,
    set_warehouse: si.set_warehouse ?? null,
    is_pos: si.is_pos ?? null,
    is_return: si.is_return ?? null,
    return_against: si.return_against ?? null,
    payment_type: si.payment_type ?? null,
    custom_payment_type: si.custom_payment_type ?? null,
    custom_merchant_coupon_code: si.custom_merchant_coupon_code ?? null,
    merchant_coupon_code: si.merchant_coupon_code ?? null,
    coupon_code: si.coupon_code ?? null,
    custom_coupon_code: si.custom_coupon_code ?? null,
    posa_pos_opening_shift: si.posa_pos_opening_shift ?? null,
    owner: si.owner ?? null,
    contact_email: si.contact_email ?? null,
    contact_mobile: si.contact_mobile ?? null,
    address_display: si.address_display ?? null,
    shipping_address: si.shipping_address ?? null,
    shipping_rule: si.shipping_rule ?? null,
    total_taxes_and_charges: si.total_taxes_and_charges ?? null,
    taxes: (si.taxes ?? []).map((t) => ({
      description: t.description ?? null,
      tax_amount: t.tax_amount ?? null,
      account_head: t.account_head ?? null,
    })),
    items: (si.items ?? []).map((item) => ({
      item_code: item.item_code,
      item_name: item.item_name ?? null,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount ?? null,
      price_list_rate: item.price_list_rate ?? null,
      discount_amount: item.discount_amount ?? null,
    })),
    payments: (si.payments ?? []).map((p) => ({
      mode_of_payment: p.mode_of_payment,
      amount: p.amount ?? null,
    })),
  };
}

export function shouldSkipErpSalesInvoiceForMissingImport(row: ErpSalesInvoiceListRow): boolean {
  if (row.docstatus !== 1) return true;
  if (
    isErpReturnSalesInvoice(row.is_return, row.grand_total ?? null, row.return_against) ||
    isErpSalesInvoiceCreditNoted(row.status, row.docstatus)
  ) {
    return true;
  }
  return false;
}

async function findLinkedVaultOrderForPoNo(poNo: string | null | undefined) {
  const trimmed = poNo?.trim();
  if (!trimmed) return null;
  return prisma.order.findFirst({
    where: {
      OR: [{ name: trimmed }, { shopifyOrderId: trimmed }, { orderNumber: trimmed }],
      sourceName: { notIn: ["erpnext", "erpnext-pos"] },
    },
    select: { id: true },
  });
}

export async function isErpSalesInvoicePresentInVault(row: ErpSalesInvoiceListRow): Promise<boolean> {
  const existing = await findOrderForErpInvoiceReference(row.name);
  if (existing) return true;
  const linked = await findLinkedVaultOrderForPoNo(row.po_no);
  return !!linked;
}

async function listRecentErpSalesInvoices(
  cfg: ReturnType<typeof getErpConfig>,
  companies: string[],
  since: string,
  limit: number,
): Promise<ErpSalesInvoiceListRow[]> {
  if (companies.length === 0) return [];
  const filters = encodeURIComponent(
    JSON.stringify([
      ["company", "in", companies],
      ["docstatus", "=", 1],
      ["creation", ">=", since],
    ]),
  );
  const fields = encodeURIComponent(
    JSON.stringify([
      "name",
      "company",
      "po_no",
      "is_return",
      "return_against",
      "grand_total",
      "status",
      "docstatus",
      "is_pos",
      "creation",
    ]),
  );
  const rows = await erpnextFetch<ErpSalesInvoiceListRow[]>(
    cfg,
    `/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&order_by=creation asc&limit_page_length=${limit}`,
  );
  return rows ?? [];
}

async function fetchErpSalesInvoiceDocument(
  cfg: ReturnType<typeof getErpConfig>,
  name: string,
): Promise<ErpSalesInvoiceDocument | null> {
  return erpnextFetch<ErpSalesInvoiceDocument>(
    cfg,
    `/api/resource/Sales Invoice/${encodeURIComponent(name)}`,
  );
}

async function replayErpSalesInvoiceWebhook(
  secret: string,
  payload: ErpnextSalesInvoiceWebhookPayload,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${getAppBaseUrl()}/api/webhooks/erpnext/sales-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-erpnext-secret": secret,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, body };
}

async function getUsersToNotifyForErpImportFailures(companyId: string) {
  return prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT DISTINCT u."id"
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u."id"
      JOIN "Role" r ON r."id" = ur."roleId"
      LEFT JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
      LEFT JOIN "Permission" p ON p."id" = rp."permissionId"
      WHERE u."companyId" = ${companyId}
        AND (
          p."key" IN ('failed_webhooks.read', 'orders.manage')
          OR r."name" IN ('admin', 'super_admin')
        )
    `,
  );
}

async function notifyErpMissingOrderFailures(
  companyId: string,
  failures: Array<{ invoiceName: string; reason: string }>,
) {
  if (failures.length === 0) return;
  const users = await getUsersToNotifyForErpImportFailures(companyId);
  const sample = failures
    .slice(0, 5)
    .map((f) => `${f.invoiceName} (${f.reason})`)
    .join("; ");
  const suffix = failures.length > 5 ? ` (+${failures.length - 5} more)` : "";
  const title = `${failures.length} ERP order(s) missing from Vault OS`;
  const body = `Automatic import failed for: ${sample}${suffix}. Check ERP webhooks or run scripts/backfill-erp-si-webhook.mjs.`;

  await Promise.all(
    users.map((u) =>
      createNotification({
        companyId,
        userId: u.id,
        type: "erp_missing_order_audit",
        title,
        body,
        entityType: "Order",
        entityId: null,
      }),
    ),
  );
}

async function auditErpInstance(
  instance: ErpnextInstance,
  options: { lookbackDays: number; limit: number },
): Promise<{
  invoicesScanned: number;
  missingFound: number;
  imported: number;
  stillMissing: number;
  failed: Array<{ invoiceName: string; reason: string }>;
}> {
  const cfg = getErpConfig(instance);
  const secret =
    instance.incomingWebhookSecret?.trim() ||
    process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET?.trim() ||
    "";

  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    return { invoicesScanned: 0, missingFound: 0, imported: 0, stillMissing: 0, failed: [] };
  }

  const locations = await prisma.companyLocation.findMany({
    where: { erpnextInstanceId: instance.id, erpnextCompany: { not: null } },
    select: { erpnextCompany: true },
  });
  const companies = [
    ...new Set(
      locations
        .map((l) => l.erpnextCompany?.trim())
        .filter((c): c is string => !!c),
    ),
  ];

  const since = lookbackDate(options.lookbackDays);
  const rows = await listRecentErpSalesInvoices(cfg, companies, since, options.limit);

  let missingFound = 0;
  let imported = 0;
  let stillMissing = 0;
  const failed: Array<{ invoiceName: string; reason: string }> = [];

  for (const row of rows) {
    if (shouldSkipErpSalesInvoiceForMissingImport(row)) continue;
    if (await isErpSalesInvoicePresentInVault(row)) continue;

    missingFound += 1;

    if (!secret) {
      failed.push({ invoiceName: row.name, reason: "no webhook secret configured" });
      stillMissing += 1;
      continue;
    }

    const doc = await fetchErpSalesInvoiceDocument(cfg, row.name);
    if (!doc) {
      failed.push({ invoiceName: row.name, reason: "invoice not found in ERP" });
      stillMissing += 1;
      continue;
    }

    const payload = mapErpSalesInvoiceToWebhookPayload(doc);
    const replay = await replayErpSalesInvoiceWebhook(secret, payload);
    if (!replay.ok) {
      failed.push({
        invoiceName: row.name,
        reason: `webhook HTTP ${replay.status}`,
      });
      stillMissing += 1;
      continue;
    }

    if (await isErpSalesInvoicePresentInVault(row)) {
      imported += 1;
      continue;
    }

    // Credit-note handler may mark an existing order returned without creating this name.
    if (replay.body.returned === true || replay.body.skipped === true) {
      continue;
    }

    failed.push({
      invoiceName: row.name,
      reason: "import replay did not create a Vault order",
    });
    stillMissing += 1;
  }

  return {
    invoicesScanned: rows.length,
    missingFound,
    imported,
    stillMissing,
    failed,
  };
}

/** Compare recent ERP Sales Invoices with Vault OS and replay missed webhooks. */
export async function auditAndImportMissingErpOrders(options?: {
  lookbackDays?: number;
  limitPerInstance?: number;
}): Promise<ErpMissingOrderAuditResult> {
  const lookbackDays = Math.min(Math.max(options?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS, 1), 30);
  const limitPerInstance = Math.min(
    Math.max(options?.limitPerInstance ?? DEFAULT_LIMIT_PER_INSTANCE, 1),
    50,
  );

  const instances = await prisma.erpnextInstance.findMany();

  let invoicesScanned = 0;
  let missingFound = 0;
  let imported = 0;
  let stillMissing = 0;
  const failed: Array<{ invoiceName: string; reason: string }> = [];

  for (const instance of instances) {
    const result = await auditErpInstance(instance, { lookbackDays, limitPerInstance });
    invoicesScanned += result.invoicesScanned;
    missingFound += result.missingFound;
    imported += result.imported;
    stillMissing += result.stillMissing;
    failed.push(...result.failed);

    if (result.failed.length > 0) {
      await notifyErpMissingOrderFailures(instance.companyId, result.failed).catch((err) =>
        console.error("[ERP missing order audit] notification failed:", err),
      );
    }
  }

  if (missingFound > 0 || stillMissing > 0) {
    console.log("[ERP missing order audit]", {
      instancesChecked: instances.length,
      invoicesScanned,
      missingFound,
      imported,
      stillMissing,
      failedCount: failed.length,
    });
  }

  return {
    instancesChecked: instances.length,
    invoicesScanned,
    missingFound,
    imported,
    stillMissing,
    failed,
  };
}
