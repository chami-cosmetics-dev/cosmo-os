import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";

import {
  ingestParsedErpSalesInvoice,
  type ErpSalesInvoiceIngestCreds,
} from "@/lib/erp-sales-invoice-ingest";
import { erpInvoiceReferenceLookupValues } from "@/lib/erp-invoice-reference";
import { prisma } from "@/lib/prisma";
import { erpnextSalesInvoiceWebhookSchema } from "@/lib/validation/erpnext-sales-invoice";

export const ERP_INBOUND_RECONCILE_LOOKBACK_DAYS = 14;
export const ERP_INBOUND_RECONCILE_INGEST_LIMIT = 15;
export const ERP_INBOUND_MISS_ENTITY_TYPE = "ErpInboundInvoice";

const PAGE_LENGTH = 200;
const MAX_PAGES = 50;
const EXISTENCE_CHUNK = 200;

export type ErpInboundInvoiceListRow = {
  name?: string;
  company?: string | null;
  docstatus?: number | null;
  is_return?: number | boolean | null;
  modified?: string | null;
  posting_date?: string | null;
};

type ErpInstanceForReconcile = {
  id: string;
  companyId: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

export function isErpInboundReconcileCandidate(row: {
  name?: string | null;
  docstatus?: number | null;
  is_return?: number | boolean | null;
}): boolean {
  const name = row.name?.trim();
  if (!name) return false;
  if (row.docstatus != null && row.docstatus !== 1) return false;
  if (row.is_return === 1 || row.is_return === true) return false;
  return true;
}

/** OS lookup keys for an ERP Sales Invoice name. */
export function osLookupKeysForErpInvoice(invoiceName: string): string[] {
  const trimmed = invoiceName.trim();
  const keys = new Set<string>([`erp-${trimmed}`, ...erpInvoiceReferenceLookupValues(trimmed)]);
  if (trimmed) keys.add(trimmed);
  return [...keys];
}

export function findMissingErpInvoiceNames(
  erpNames: string[],
  existingKeys: Iterable<string>,
): string[] {
  const have = new Set(
    [...existingKeys].map((key) => key.trim()).filter(Boolean),
  );
  return erpNames.filter((name) => {
    const keys = osLookupKeysForErpInvoice(name);
    return !keys.some((key) => have.has(key));
  });
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Map ERP Sales Invoice resource doc to the OS webhook payload shape. */
export function mapErpSalesInvoiceResourceToWebhookPayload(
  si: Record<string, unknown>,
): Record<string, unknown> {
  const taxes = Array.isArray(si.taxes) ? si.taxes : [];
  const items = Array.isArray(si.items) ? si.items : [];
  const payments = Array.isArray(si.payments) ? si.payments : [];

  return {
    name: si.name,
    customer: si.customer,
    customer_name: si.customer_name,
    company: si.company,
    posting_date: si.posting_date,
    grand_total: asNumber(si.grand_total) ?? 0,
    net_total: asNumber(si.net_total) ?? 0,
    discount_amount: asNumber(si.discount_amount) ?? 0,
    po_no: si.po_no,
    currency: si.currency,
    docstatus: asNumber(si.docstatus) ?? 0,
    status: si.status,
    outstanding_amount: asNumber(si.outstanding_amount),
    paid_amount: asNumber(si.paid_amount),
    set_warehouse: si.set_warehouse,
    is_pos: asNumber(si.is_pos) ?? 0,
    is_return: asNumber(si.is_return) ?? 0,
    return_against: si.return_against,
    payment_type: si.payment_type,
    custom_payment_type: si.custom_payment_type,
    custom_merchant_coupon_code: si.custom_merchant_coupon_code,
    merchant_coupon_code: si.merchant_coupon_code,
    coupon_code: si.coupon_code,
    custom_coupon_code: si.custom_coupon_code,
    custom_special_remarks: si.custom_special_remarks,
    special_remarks: si.special_remarks,
    posa_pos_opening_shift: si.posa_pos_opening_shift,
    pos_profile: si.pos_profile,
    owner: si.owner,
    contact_email: si.contact_email,
    contact_mobile: si.contact_mobile,
    address_display: si.address_display,
    shipping_address: si.shipping_address,
    shipping_rule: si.shipping_rule,
    total_taxes_and_charges: asNumber(si.total_taxes_and_charges) ?? 0,
    taxes: taxes.map((row) => {
      const tax = (row ?? {}) as Record<string, unknown>;
      return {
        description: tax.description,
        tax_amount: asNumber(tax.tax_amount) ?? 0,
        account_head: tax.account_head,
      };
    }),
    items: items.map((row) => {
      const item = (row ?? {}) as Record<string, unknown>;
      return {
        item_code: item.item_code,
        item_name: item.item_name,
        qty: asNumber(item.qty) ?? 0,
        rate: asNumber(item.rate) ?? 0,
        amount: asNumber(item.amount),
        price_list_rate: asNumber(item.price_list_rate),
        discount_amount: asNumber(item.discount_amount) ?? 0,
        warehouse: item.warehouse,
      };
    }),
    payments: payments.map((row) => {
      const payment = (row ?? {}) as Record<string, unknown>;
      return {
        mode_of_payment: payment.mode_of_payment,
        amount: asNumber(payment.amount) ?? 0,
      };
    }),
  };
}

function erpAuthHeaders(instance: ErpInstanceForReconcile) {
  return { Authorization: `token ${instance.apiKey}:${instance.apiSecret}` };
}

function erpBase(instance: ErpInstanceForReconcile) {
  return instance.baseUrl.replace(/\/$/, "");
}

function lookbackModifiedSince(now = new Date()): string {
  const since = new Date(
    now.getTime() - ERP_INBOUND_RECONCILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  return since.toISOString().slice(0, 19).replace("T", " ");
}

async function listRecentSubmittedSalesInvoices(
  instance: ErpInstanceForReconcile,
  companies: string[],
): Promise<ErpInboundInvoiceListRow[]> {
  if (companies.length === 0) return [];
  const base = erpBase(instance);
  const filters = JSON.stringify([
    ["modified", ">=", lookbackModifiedSince()],
    ["docstatus", "=", 1],
    ["company", "in", companies],
  ]);
  const fields = JSON.stringify([
    "name",
    "company",
    "docstatus",
    "is_return",
    "modified",
    "posting_date",
  ]);

  const all: ErpInboundInvoiceListRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const start = page * PAGE_LENGTH;
    const url =
      `${base}/api/resource/Sales Invoice` +
      `?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&limit_page_length=${PAGE_LENGTH}&limit_start=${start}` +
      `&order_by=${encodeURIComponent("modified desc")}`;
    const res = await fetch(url, { headers: erpAuthHeaders(instance) });
    const json = (await res.json()) as { data?: ErpInboundInvoiceListRow[] };
    if (!res.ok) {
      throw new Error(
        `ERP SI list failed [${res.status}] ${instance.label}: ${JSON.stringify(json).slice(0, 300)}`,
      );
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    all.push(...rows);
    if (rows.length < PAGE_LENGTH) break;
  }
  return all;
}

async function fetchSalesInvoiceDoc(
  instance: ErpInstanceForReconcile,
  name: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `${erpBase(instance)}/api/resource/Sales Invoice/${encodeURIComponent(name)}`,
    { headers: erpAuthHeaders(instance) },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERP SI get ${name} [${res.status}]: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: Record<string, unknown> };
  return json.data ?? null;
}

async function existingOsKeysForInvoiceNames(names: string[]): Promise<Set<string>> {
  const keys = new Set<string>();
  if (names.length === 0) return keys;

  for (let i = 0; i < names.length; i += EXISTENCE_CHUNK) {
    const chunk = names.slice(i, i + EXISTENCE_CHUNK);
    const lookup = [...new Set(chunk.flatMap((name) => osLookupKeysForErpInvoice(name)))];
    const rows = await prisma.order.findMany({
      where: {
        OR: [
          { erpnextInvoiceId: { in: lookup } },
          { name: { in: lookup } },
          { shopifyOrderId: { in: lookup } },
          { orderNumber: { in: lookup } },
        ],
      },
      select: {
        name: true,
        orderNumber: true,
        shopifyOrderId: true,
        erpnextInvoiceId: true,
      },
    });
    for (const row of rows) {
      for (const value of [row.name, row.orderNumber, row.shopifyOrderId, row.erpnextInvoiceId]) {
        const trimmed = value?.trim();
        if (trimmed) keys.add(trimmed);
      }
    }
  }
  return keys;
}

async function notifyInboundInvoiceFailure(input: {
  companyId: string;
  invoiceName: string;
  reason: string;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id" FROM "Notification"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${"erp_sync_failure"}
        AND "entityType" = ${ERP_INBOUND_MISS_ENTITY_TYPE}
        AND "entityId" = ${input.invoiceName}
        AND "readAt" IS NULL
      LIMIT 1
    `,
  );
  if (existing.length > 0) return;

  const admins = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT DISTINCT u."id"
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u."id"
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE u."companyId" = ${input.companyId}
        AND r."name" IN ('admin', 'super_admin')
    `,
  );
  if (admins.length === 0) return;

  const now = new Date();
  const title = `ERP invoice missing on OS — ${input.invoiceName}`;
  const body = `${input.invoiceName} exists in ERP but failed to land in OS. ${input.reason}`;

  for (const user of admins) {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Notification" ("id","companyId","userId","type","title","body","entityType","entityId","createdAt")
        VALUES (
          ${randomUUID()},
          ${input.companyId},
          ${user.id},
          ${"erp_sync_failure"},
          ${title},
          ${body},
          ${ERP_INBOUND_MISS_ENTITY_TYPE},
          ${input.invoiceName},
          ${now}
        )
      `,
    );
  }
}

async function clearInboundInvoiceFailure(companyId: string, invoiceName: string) {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "Notification"
      SET "readAt" = ${new Date()}
      WHERE "companyId" = ${companyId}
        AND "type" = ${"erp_sync_failure"}
        AND "entityType" = ${ERP_INBOUND_MISS_ENTITY_TYPE}
        AND "entityId" = ${invoiceName}
        AND "readAt" IS NULL
    `,
  );
}

export type ErpInboundReconcileResult = {
  scanned: number;
  missing: number;
  ingested: number;
  skipped: number;
  failed: number;
  remaining: number;
  failures: Array<{ invoice: string; error: string }>;
};

export async function reconcileMissingErpInboundInvoices(options?: {
  ingestLimit?: number;
}): Promise<ErpInboundReconcileResult> {
  const ingestLimit = options?.ingestLimit ?? ERP_INBOUND_RECONCILE_INGEST_LIMIT;
  const summary: ErpInboundReconcileResult = {
    scanned: 0,
    missing: 0,
    ingested: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
    failures: [],
  };

  const instances = await prisma.erpnextInstance.findMany({
    select: {
      id: true,
      companyId: true,
      label: true,
      baseUrl: true,
      apiKey: true,
      apiSecret: true,
    },
  });

  const work: Array<{
    instance: ErpInstanceForReconcile;
    name: string;
  }> = [];

  for (const instance of instances) {
    const locations = await prisma.companyLocation.findMany({
      where: {
        erpnextInstanceId: instance.id,
        erpnextCompany: { not: null },
      },
      select: { erpnextCompany: true },
    });
    const companies = [
      ...new Set(
        locations
          .map((row) => row.erpnextCompany?.trim())
          .filter((name): name is string => !!name),
      ),
    ];
    if (companies.length === 0) continue;

    let rows: ErpInboundInvoiceListRow[];
    try {
      rows = await listRecentSubmittedSalesInvoices(instance, companies);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ERP inbound reconcile] list failed for ${instance.label}:`, message);
      summary.failures.push({ invoice: instance.label, error: message });
      summary.failed += 1;
      continue;
    }

    const candidates = rows
      .filter(isErpInboundReconcileCandidate)
      .map((row) => asString(row.name))
      .filter((name): name is string => !!name);
    summary.scanned += candidates.length;

    const existing = await existingOsKeysForInvoiceNames(candidates);
    const missing = findMissingErpInvoiceNames(candidates, existing);
    summary.missing += missing.length;
    work.push(...missing.map((name) => ({ instance, name })));
  }

  const toIngest = work.slice(0, ingestLimit);
  summary.remaining = Math.max(0, work.length - toIngest.length);

  for (const item of toIngest) {
    const creds: ErpSalesInvoiceIngestCreds = {
      baseUrl: erpBase(item.instance),
      apiKey: item.instance.apiKey,
      apiSecret: item.instance.apiSecret,
      label: item.instance.label,
    };

    try {
      const si = await fetchSalesInvoiceDoc(item.instance, item.name);
      if (!si) {
        throw new Error("Sales Invoice not found on ERP");
      }
      const mapped = mapErpSalesInvoiceResourceToWebhookPayload(si);
      const parsed = erpnextSalesInvoiceWebhookSchema.safeParse(mapped);
      if (!parsed.success) {
        throw new Error(`Invalid SI payload: ${JSON.stringify(parsed.error.flatten()).slice(0, 240)}`);
      }
      const result = await ingestParsedErpSalesInvoice({
        data: parsed.data,
        rawPayload: si,
        instanceCreds: creds,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      if (result.ok && "skipped" in result && result.skipped) {
        summary.skipped += 1;
      } else {
        summary.ingested += 1;
      }
      await clearInboundInvoiceFailure(item.instance.companyId, item.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ERP inbound reconcile] ${item.name}:`, message);
      summary.failed += 1;
      summary.failures.push({ invoice: item.name, error: message });
      await notifyInboundInvoiceFailure({
        companyId: item.instance.companyId,
        invoiceName: item.name,
        reason: message,
      }).catch((notifyError) => {
        console.error("[ERP inbound reconcile] notify failed:", notifyError);
      });
    }
  }

  return summary;
}
