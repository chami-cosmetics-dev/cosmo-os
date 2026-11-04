import "server-only";

import { randomUUID } from "node:crypto";

import { isRealErpSalesInvoiceId } from "@/lib/approval-workflow";
import { fetchAuditLogs, writeAuditLog } from "@/lib/audit-log";
import { collectContactPhonesSync } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { parseAppCalendarDayEnd, parseAppCalendarDayStart } from "@/lib/format-datetime";
import { getMerchantDisplayName } from "@/lib/merchant-groups";
import { prisma } from "@/lib/prisma";

import {
  suggestConsultationMerchant,
  type ConsultationHistoryEntry,
  type ConsultationInvoiceMatch,
  type ConsultationMerchantOption,
  type ConsultationRow,
} from "./shared";

function monthBounds(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(year, monthIndex - 1, 1)),
    lt: new Date(Date.UTC(year, monthIndex, 1)),
  };
}

function toRow(record: {
  id: string;
  entryId: string;
  consultationDate: Date;
  contactNumber: string;
  invoiceNumber: string;
  customerName: string;
  merchantKind: string;
  merchantName: string;
  physicalReview: string | null;
  createdAt: Date;
}): ConsultationRow {
  return {
    id: record.id,
    entryId: record.entryId,
    consultationDate: record.consultationDate.toISOString().slice(0, 10),
    contactNumber: record.contactNumber,
    invoiceNumber: record.invoiceNumber,
    customerName: record.customerName,
    merchantKind: record.merchantKind === "merchant" ? "merchant" : "showroom",
    merchantName: record.merchantName,
    physicalReview: record.physicalReview ?? "",
    createdAt: record.createdAt.toISOString(),
  };
}

export async function listConsultations(companyId: string, month: string): Promise<ConsultationRow[]> {
  const records = await prisma.physicalConsultation.findMany({
    where: { companyId, consultationDate: monthBounds(month) },
    orderBy: [{ consultationDate: "asc" }, { createdAt: "asc" }, { invoiceNumber: "asc" }],
  });
  return records.map(toRow);
}

/** Cancelled in Cosmo OS, or voided (cancelled / credit-noted) in ERP. */
function isCancelledOrder(order: { cancelledAt: Date | null; financialStatus: string | null }) {
  return order.cancelledAt !== null || order.financialStatus === "voided";
}

/**
 * Invoice numbers that belong only to cancelled orders.
 * Numbers that match no order at all are allowed (they may be typed in by hand).
 */
export async function findCancelledInvoices(companyId: string, invoiceNumbers: string[]): Promise<string[]> {
  const numbers = [...new Set(invoiceNumbers.map((value) => value.trim().toUpperCase()).filter(Boolean))];
  if (numbers.length === 0) return [];
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      OR: [{ erpnextInvoiceId: { in: numbers } }, { name: { in: numbers } }, { orderNumber: { in: numbers } }],
    },
    select: { erpnextInvoiceId: true, name: true, orderNumber: true, cancelledAt: true, financialStatus: true },
  });
  const live = new Set<string>();
  const cancelled = new Set<string>();
  for (const order of orders) {
    for (const ref of [order.erpnextInvoiceId, order.name, order.orderNumber]) {
      const key = ref?.trim().toUpperCase();
      if (key && numbers.includes(key)) (isCancelledOrder(order) ? cancelled : live).add(key);
    }
  }
  return numbers.filter((number) => cancelled.has(number) && !live.has(number));
}

/** Order `discountCodes` JSON ([{ code }]) → upper-cased codes. */
function extractDiscountCodes(discountCodes: unknown): string[] {
  if (!Array.isArray(discountCodes)) return [];
  return discountCodes
    .map((entry) =>
      entry && typeof entry === "object" && typeof (entry as { code?: unknown }).code === "string"
        ? (entry as { code: string }).code.trim().toUpperCase()
        : "",
    )
    .filter(Boolean);
}

function looksLikePhone(value: string) {
  return /^\+?[\d\s-]{7,}$/.test(value);
}

function pickInvoiceCustomerName(order: {
  customer: { firstName: string | null; lastName: string | null } | null;
  shippingAddress: unknown;
}): string | null {
  const candidates: string[] = [];
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const address = order.shippingAddress as Record<string, unknown>;
    const fromParts = [address.first_name, address.last_name]
      .filter((part): part is string => typeof part === "string" && part.trim() !== "")
      .join(" ");
    if (typeof address.name === "string") candidates.push(address.name);
    candidates.push(fromParts);
  }
  if (order.customer) {
    candidates.push([order.customer.firstName, order.customer.lastName].filter(Boolean).join(" "));
  }
  for (const candidate of candidates) {
    const name = candidate.trim().replace(/\s+/g, " ");
    // ERP customers keyed by mobile often carry the number as their "name".
    if (name && !looksLikePhone(name)) return name;
  }
  return null;
}

/** Invoices placed by this phone number on the given (Colombo) calendar day. */
export async function lookupConsultationInvoices(input: {
  companyId: string;
  phone: string;
  date: string;
}): Promise<ConsultationInvoiceMatch[]> {
  const phones = collectContactPhonesSync(input.phone);
  const dayStart = parseAppCalendarDayStart(input.date);
  const dayEnd = parseAppCalendarDayEnd(input.date);
  if (phones.length === 0 || !dayStart || !dayEnd) return [];

  const orders = await prisma.order.findMany({
    where: {
      companyId: input.companyId,
      createdAt: { gte: dayStart, lte: dayEnd },
      // Cancelled orders are returned too, flagged, so staff see why an invoice can't be used.
      OR: buildContactOrderLookupOr({ phones, emails: [] }),
    },
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      cancelledAt: true,
      financialStatus: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      shippingAddress: true,
      discountCodes: true,
      customer: { select: { firstName: true, lastName: true } },
      assignedMerchant: { select: { knownName: true, name: true, email: true } },
      companyLocation: { select: { name: true } },
    },
  });

  // Coupon code → merchant name, only for codes that appear on these orders.
  const orderCodes = [...new Set(orders.flatMap((order) => extractDiscountCodes(order.discountCodes)))];
  const couponOwners = new Map<string, string>();
  if (orderCodes.length > 0) {
    const owners = await prisma.user.findMany({
      where: {
        companyId: input.companyId,
        couponCodes: { hasSome: [...orderCodes, ...orderCodes.map((code) => code.toLowerCase())] },
      },
      select: { knownName: true, name: true, email: true, couponCodes: true },
    });
    for (const owner of owners) {
      for (const code of owner.couponCodes) {
        const key = code.trim().toUpperCase();
        if (key && !couponOwners.has(key)) couponOwners.set(key, getMerchantDisplayName(owner));
      }
    }
  }

  const seen = new Set<string>();
  const matches: ConsultationInvoiceMatch[] = [];
  for (const order of orders) {
    // erpnextInvoiceId is "pending" / "pending_approval" until the ERP invoice exists —
    // fall back to the order number so the purchase can still be logged.
    const hasErpInvoice = isRealErpSalesInvoiceId(order.erpnextInvoiceId);
    const invoiceNumber = (hasErpInvoice ? order.erpnextInvoiceId : order.name ?? order.orderNumber)
      ?.trim()
      .toUpperCase();
    if (!invoiceNumber || seen.has(invoiceNumber)) continue;
    seen.add(invoiceNumber);
    const locationName = order.companyLocation?.name ?? null;
    const discountCodes = extractDiscountCodes(order.discountCodes);
    const couponMerchant = discountCodes
      .map((code) => couponOwners.get(code))
      .find(Boolean);
    const merchantName =
      couponMerchant ?? (order.assignedMerchant ? getMerchantDisplayName(order.assignedMerchant) : null);
    matches.push({
      invoiceNumber,
      isOrderNumber: !hasErpInvoice,
      cancelled: isCancelledOrder(order),
      customerName: pickInvoiceCustomerName(order),
      locationName,
      suggestedMerchant: suggestConsultationMerchant({ merchantName, locationName, discountCodes }),
    });
  }
  return matches;
}

export async function createConsultationEntry(input: {
  companyId: string;
  userId: string;
  consultationDate: string;
  contactNumber: string;
  invoiceNumbers: string[];
  customerName: string;
  merchant: ConsultationMerchantOption;
  physicalReview: string | null;
}): Promise<ConsultationRow[]> {
  const { merchant } = input;
  const entryId = randomUUID();
  const consultationDate = new Date(`${input.consultationDate}T00:00:00.000Z`);
  const records = await prisma.$transaction(
    input.invoiceNumbers.map((invoiceNumber) =>
      prisma.physicalConsultation.create({
        data: {
          companyId: input.companyId,
          entryId,
          consultationDate,
          contactNumber: input.contactNumber,
          invoiceNumber,
          customerName: input.customerName,
          merchantKind: merchant.kind,
          merchantName: merchant.label,
          physicalReview: input.physicalReview,
          createdByUserId: input.userId,
          updatedByUserId: input.userId,
        },
      }),
    ),
  );
  const rows = records.map(toRow);
  await logConsultationChange({
    companyId: input.companyId,
    userId: input.userId,
    action: "consultation_created",
    rows,
    summary: `Added ${describeEntry(rows)} — ${merchant.label}`,
    afterData: snapshotEntry(rows),
  });
  return rows;
}

/**
 * Invoice number → order total (e.g. 6500) for the Excel export. Matches the ERP invoice
 * number first, then the order number used while the ERP invoice was pending.
 * Numbers typed in that match no order are simply missing from the map.
 */
export async function getConsultationInvoiceValues(
  companyId: string,
  invoiceNumbers: string[],
): Promise<Map<string, number>> {
  const numbers = [...new Set(invoiceNumbers.map((value) => value.trim().toUpperCase()).filter(Boolean))];
  const values = new Map<string, number>();
  if (numbers.length === 0) return values;

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      OR: [{ erpnextInvoiceId: { in: numbers } }, { name: { in: numbers } }, { orderNumber: { in: numbers } }],
    },
    orderBy: { createdAt: "desc" },
    select: { erpnextInvoiceId: true, name: true, orderNumber: true, totalPrice: true },
  });

  const byOrderNumber = new Map<string, number>();
  for (const order of orders) {
    const total = Number(order.totalPrice);
    const erpId = order.erpnextInvoiceId?.trim().toUpperCase();
    if (erpId && !values.has(erpId)) values.set(erpId, total);
    for (const ref of [order.name, order.orderNumber]) {
      const key = ref?.trim().toUpperCase();
      if (key && !byOrderNumber.has(key)) byOrderNumber.set(key, total);
    }
  }
  for (const [key, total] of byOrderNumber) {
    if (!values.has(key)) values.set(key, total);
  }
  return values;
}

/** "D M J Wijewardana (400-000567, 600-006515)" */
function describeEntry(rows: ConsultationRow[]) {
  return `${rows[0]?.customerName ?? "Customer"} (${rows.map((row) => row.invoiceNumber).join(", ")})`;
}

/** Everything needed to see — or re-add — an entry from its history. */
function snapshotEntry(rows: ConsultationRow[]) {
  const head = rows[0];
  return {
    consultationDate: head?.consultationDate,
    contactNumber: head?.contactNumber,
    customerName: head?.customerName,
    merchantName: head?.merchantName,
    merchantKind: head?.merchantKind,
    invoiceNumbers: rows.map((row) => row.invoiceNumber),
    physicalReview: head?.physicalReview ?? "",
  };
}

async function logConsultationChange(input: {
  companyId: string;
  userId: string;
  action: "consultation_created" | "consultation_review_updated" | "consultation_deleted";
  rows: ConsultationRow[];
  summary: string;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.userId,
    module: "consultation-insights",
    action: input.action,
    entityType: "physical_consultation",
    entityId: input.rows[0]?.entryId ?? null,
    summary: input.summary,
    beforeData: input.beforeData,
    afterData: input.afterData,
  });
}

/** Latest adds / review changes / deletes, newest first. */
export async function listConsultationHistory(companyId: string, limit = 100): Promise<ConsultationHistoryEntry[]> {
  const entries = await fetchAuditLogs({ companyId, module: "consultation-insights", limit });
  return entries.map((entry) => {
    const before = entry.beforeData as { physicalReview?: string } | null;
    const after = entry.afterData as { physicalReview?: string } | null;
    return {
      id: entry.id,
      action: entry.action,
      summary: entry.summary,
      actorName: entry.actorUserName ?? entry.actorUserEmail ?? "Unknown user",
      createdAt: entry.createdAt,
      reviewBefore: entry.action === "consultation_review_updated" ? (before?.physicalReview ?? "") : null,
      reviewAfter: entry.action === "consultation_review_updated" ? (after?.physicalReview ?? "") : null,
    };
  });
}

/** Deletes the customer and all of their invoice rows. Returns the number of rows removed. */
export async function deleteConsultationEntry(input: {
  companyId: string;
  userId: string;
  id: string;
}): Promise<number> {
  const existing = await prisma.physicalConsultation.findFirst({
    where: { id: input.id, companyId: input.companyId },
    select: { entryId: true },
  });
  if (!existing) return 0;
  const where = { companyId: input.companyId, entryId: existing.entryId };
  const rows = (await prisma.physicalConsultation.findMany({ where, orderBy: { createdAt: "asc" } })).map(toRow);
  const result = await prisma.physicalConsultation.deleteMany({ where });
  if (result.count > 0) {
    await logConsultationChange({
      companyId: input.companyId,
      userId: input.userId,
      action: "consultation_deleted",
      rows,
      summary: `Deleted ${describeEntry(rows)} — ${rows[0]?.merchantName ?? ""}`,
      beforeData: snapshotEntry(rows),
    });
  }
  return result.count;
}

/** The review belongs to the customer, so it is written to every invoice row of the entry. */
export async function updateConsultationReview(input: {
  companyId: string;
  userId: string;
  id: string;
  physicalReview: string | null;
}): Promise<ConsultationRow[] | null> {
  const existing = await prisma.physicalConsultation.findFirst({
    where: { id: input.id, companyId: input.companyId },
    select: { entryId: true, physicalReview: true },
  });
  if (!existing) return null;
  const where = { companyId: input.companyId, entryId: existing.entryId };
  await prisma.physicalConsultation.updateMany({
    where,
    data: { physicalReview: input.physicalReview, updatedByUserId: input.userId },
  });
  const records = await prisma.physicalConsultation.findMany({ where, orderBy: { createdAt: "asc" } });
  const rows = records.map(toRow);
  const before = existing.physicalReview ?? "";
  const after = input.physicalReview ?? "";
  if (before !== after) {
    await logConsultationChange({
      companyId: input.companyId,
      userId: input.userId,
      action: "consultation_review_updated",
      rows,
      summary: `${after ? (before ? "Changed" : "Added") : "Removed"} review for ${describeEntry(rows)}`,
      beforeData: { physicalReview: before },
      afterData: { physicalReview: after },
    });
  }
  return rows;
}
