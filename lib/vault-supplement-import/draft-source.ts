import { prisma } from "@/lib/prisma";

import {
  buildSupplementDraftRows,
  type DraftAdaptInvoice,
  type DraftContact,
  type DraftLine,
  type DraftOrder,
} from "@/lib/vault-supplement-import/draft";
import type { PurchaseSheetRow } from "@/lib/vault-supplement-import/template-workbook";

const PAGE = 300;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function customerNameFromOrder(order: {
  name: string | null;
  shippingAddress: unknown;
  customer: { firstName: string | null; lastName: string | null } | null;
}): string | null {
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const shipping = order.shippingAddress as Record<string, unknown>;
    const combined = [shipping.first_name, shipping.last_name].filter(Boolean).join(" ").trim();
    const raw = text(shipping.name) ?? (combined || null);
    if (raw) return raw;
  }
  const fromCustomer = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ").trim();
  return fromCustomer || order.name;
}

function addressFromShipping(raw: unknown): { address: string | null; city: string | null } {
  if (!raw || typeof raw !== "object") return { address: null, city: null };
  const shipping = raw as Record<string, unknown>;
  return {
    address: text(shipping.address1) ?? text(shipping.address),
    city: text(shipping.city),
  };
}

function adaptLines(raw: unknown): DraftLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: DraftLine[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const itemCode = text(item.itemCode) ?? text(item.item_code);
    const itemName = text(item.itemName) ?? text(item.item_name);
    const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
    const priceRaw = item.unitPrice ?? item.unit_price;
    const unitPrice = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
    lines.push({
      itemCode,
      itemName,
      quantity,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    });
  }
  return lines;
}

async function loadOrders(companyId: string, itemCodes: Set<string>): Promise<DraftOrder[]> {
  const orders: DraftOrder[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.order.findMany({
      where: {
        companyId,
        cancelledAt: null,
        NOT: { financialStatus: { equals: "voided", mode: "insensitive" } },
      },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        orderNumber: true,
        name: true,
        createdAt: true,
        cancelledAt: true,
        financialStatus: true,
        currency: true,
        customerPhone: true,
        customerEmail: true,
        district: true,
        shippingAddress: true,
        paymentGatewayPrimary: true,
        customer: { select: { firstName: true, lastName: true } },
        companyLocation: { select: { name: true } },
        assignedMerchant: { select: { knownName: true, name: true } },
        lineItems: {
          select: {
            quantity: true,
            price: true,
            productItem: { select: { sku: true, productTitle: true } },
          },
        },
      },
    });
    if (batch.length === 0) break;

    for (const order of batch) {
      const lines = order.lineItems
        .filter((line) => {
          const sku = line.productItem.sku?.trim() ?? "";
          return sku && itemCodes.has(sku);
        })
        .map((line) => ({
          itemCode: line.productItem.sku?.trim() ?? null,
          itemName: line.productItem.productTitle,
          quantity: line.quantity,
          unitPrice: Number(line.price),
        }));
      if (lines.length === 0) continue;
      const address = addressFromShipping(order.shippingAddress);
      orders.push({
        id: order.id,
        orderNumber: order.orderNumber,
        name: order.name,
        createdAt: order.createdAt,
        cancelledAt: order.cancelledAt,
        financialStatus: order.financialStatus,
        customerName: customerNameFromOrder(order),
        phone: order.customerPhone,
        email: order.customerEmail,
        address: address.address,
        city: address.city,
        district: order.district,
        currency: order.currency,
        paymentMethod: order.paymentGatewayPrimary,
        location: order.companyLocation.name,
        merchant: order.assignedMerchant?.knownName?.trim() || order.assignedMerchant?.name?.trim() || null,
        lines,
      });
    }

    cursor = batch[batch.length - 1]!.id;
    if (batch.length < PAGE) break;
  }
  return orders;
}

async function loadAdapt(companyId: string, itemCodes: Set<string>): Promise<DraftAdaptInvoice[]> {
  const invoices: DraftAdaptInvoice[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.adaptPurchaseHistory.findMany({
      where: { companyId },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        adaptInvoiceKey: true,
        salesInvoiceNo: true,
        invoiceDate: true,
        currency: true,
        paymentMethod: true,
        locationName: true,
        merchantKnownName: true,
        lineItems: true,
        contact: {
          select: {
            name: true,
            phoneNumber: true,
            email: true,
            address: true,
            city: true,
            district: true,
          },
        },
      },
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      const lines = adaptLines(row.lineItems).filter((line) => {
        const code = line.itemCode?.trim() ?? "";
        return code && itemCodes.has(code);
      });
      if (lines.length === 0) continue;
      invoices.push({
        adaptInvoiceKey: row.adaptInvoiceKey,
        salesInvoiceNo: row.salesInvoiceNo,
        invoiceDate: row.invoiceDate,
        customerName: row.contact.name,
        phone: row.contact.phoneNumber,
        email: row.contact.email,
        address: row.contact.address,
        city: row.contact.city,
        district: row.contact.district,
        currency: row.currency,
        paymentMethod: row.paymentMethod,
        location: row.locationName,
        merchant: row.merchantKnownName,
        lines,
      });
    }

    cursor = batch[batch.length - 1]!.id;
    if (batch.length < PAGE) break;
  }
  return invoices;
}

async function loadContacts(companyId: string, phones: string[], emails: string[]): Promise<DraftContact[]> {
  if (phones.length === 0 && emails.length === 0) return [];
  const or: Array<Record<string, unknown>> = [];
  if (phones.length > 0) {
    or.push({ phoneNumber: { in: phones } });
    or.push({ phones: { some: { phoneNumber: { in: phones } } } });
  }
  if (emails.length > 0) {
    or.push({ email: { in: emails, mode: "insensitive" } });
    or.push({ emails: { some: { email: { in: emails, mode: "insensitive" } } } });
  }
  return prisma.contactMaster.findMany({
    where: { companyId, OR: or },
    select: {
      name: true,
      phoneNumber: true,
      email: true,
      address: true,
      city: true,
      district: true,
    },
  });
}

export async function loadCosmoSupplementDraft(
  companyId: string,
  itemCodes: Set<string>,
): Promise<PurchaseSheetRow[]> {
  const [orders, adaptInvoices] = await Promise.all([
    loadOrders(companyId, itemCodes),
    loadAdapt(companyId, itemCodes),
  ]);
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const order of orders) {
    if (order.phone) phones.add(order.phone);
    if (order.email) emails.add(order.email);
  }
  for (const invoice of adaptInvoices) {
    if (invoice.phone) phones.add(invoice.phone);
    if (invoice.email) emails.add(invoice.email);
  }
  const contacts = await loadContacts(companyId, [...phones], [...emails]);
  return buildSupplementDraftRows({ itemCodes, orders, adaptInvoices, contacts });
}
