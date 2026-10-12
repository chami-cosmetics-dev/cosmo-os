import { formatAppIsoDate } from "@/lib/format-datetime";
import { normalizeContactEmail, normalizeContactPhone } from "@/lib/contact-identifiers";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";

import type { PurchaseSheetRow } from "@/lib/vault-supplement-import/template-workbook";

export type DraftLine = {
  itemCode: string | null;
  itemName: string | null;
  quantity: number;
  unitPrice: number;
};

export type DraftOrder = {
  id: string;
  orderNumber: string | null;
  name: string | null;
  createdAt: Date;
  cancelledAt: Date | null;
  financialStatus: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  currency: string | null;
  paymentMethod: string | null;
  location: string | null;
  merchant: string | null;
  lines: DraftLine[];
};

export type DraftAdaptInvoice = {
  adaptInvoiceKey: string;
  salesInvoiceNo: string;
  invoiceDate: Date;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  currency: string | null;
  paymentMethod: string | null;
  location: string | null;
  merchant: string | null;
  lines: DraftLine[];
};

export type DraftContact = {
  name: string;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
};

function isVoided(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "voided";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function indexContacts(contacts: DraftContact[]) {
  const byPhone = new Map<string, DraftContact[]>();
  const byEmail = new Map<string, DraftContact[]>();
  for (const contact of contacts) {
    const phone = normalizeContactPhone(contact.phoneNumber);
    if (phone) {
      const seen = new Set<string>();
      for (const variant of buildPhoneLookupVariants(phone)) {
        if (seen.has(variant)) continue;
        seen.add(variant);
        const list = byPhone.get(variant) ?? [];
        if (!list.includes(contact)) list.push(contact);
        byPhone.set(variant, list);
      }
    }
    const email = normalizeContactEmail(contact.email);
    if (email) {
      const list = byEmail.get(email) ?? [];
      if (!list.includes(contact)) list.push(contact);
      byEmail.set(email, list);
    }
  }
  return { byPhone, byEmail };
}

function uniqueContacts(matches: DraftContact[]): DraftContact[] {
  return [...new Set(matches)];
}

function matchContact(
  phone: string | null,
  email: string | null,
  index: ReturnType<typeof indexContacts>,
): DraftContact | null {
  const phoneMatches: DraftContact[] = [];
  if (phone) {
    const seen = new Set<DraftContact>();
    for (const variant of buildPhoneLookupVariants(phone)) {
      for (const contact of index.byPhone.get(variant) ?? []) {
        if (!seen.has(contact)) {
          seen.add(contact);
          phoneMatches.push(contact);
        }
      }
    }
  }
  const phones = uniqueContacts(phoneMatches);
  if (phones.length === 1) return phones[0]!;
  if (phones.length > 1) return null;
  const emailKey = normalizeContactEmail(email);
  const emails = emailKey ? uniqueContacts(index.byEmail.get(emailKey) ?? []) : [];
  if (emails.length === 1) return emails[0]!;
  return null;
}

function draftRow(input: {
  sourceRef: string;
  invoiceNo: string;
  invoiceDate: Date;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  profile: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    district: string | null;
  };
  currency: string | null;
  paymentMethod: string | null;
  location: string | null;
  merchant: string | null;
}): PurchaseSheetRow | null {
  if (!input.profile.phone && !input.profile.email) return null;
  if (!input.profile.name.trim()) return null;
  const lineAmount = roundMoney(input.quantity * input.unitPrice);
  return {
    customer_name: input.profile.name.trim(),
    phone: input.profile.phone ?? "",
    email: input.profile.email ?? "",
    address: input.profile.address ?? "",
    city: input.profile.city ?? "",
    district: input.profile.district ?? "",
    invoice_no: input.invoiceNo,
    invoice_date: formatAppIsoDate(input.invoiceDate),
    item_code: input.itemCode,
    item_name: input.itemName,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    line_amount: lineAmount,
    currency: input.currency?.trim() || "LKR",
    payment_method: input.paymentMethod ?? "",
    location: input.location ?? "",
    merchant: input.merchant ?? "",
    source_ref: input.sourceRef,
  };
}

function profileFor(
  raw: {
    customerName: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    district: string | null;
  },
  contact: DraftContact | null,
) {
  return {
    name: contact?.name?.trim() || raw.customerName?.trim() || "",
    phone: normalizeContactPhone(contact?.phoneNumber) ?? normalizeContactPhone(raw.phone),
    email: normalizeContactEmail(contact?.email) ?? normalizeContactEmail(raw.email),
    address: contact?.address?.trim() || raw.address,
    city: contact?.city?.trim() || raw.city,
    district: contact?.district?.trim() || raw.district,
  };
}

export function buildSupplementDraftRows(input: {
  itemCodes: Set<string>;
  orders: DraftOrder[];
  adaptInvoices: DraftAdaptInvoice[];
  contacts: DraftContact[];
}): PurchaseSheetRow[] {
  const codes = input.itemCodes;
  const index = indexContacts(input.contacts);
  const rows: PurchaseSheetRow[] = [];

  for (const order of input.orders) {
    if (order.cancelledAt || isVoided(order.financialStatus)) continue;
    const invoiceNo = order.orderNumber?.trim() || order.name?.trim() || order.id;
    const contact = matchContact(order.phone, order.email, index);
    const profile = profileFor(order, contact);
    for (const line of order.lines) {
      const itemCode = line.itemCode?.trim() ?? "";
      if (!itemCode || !codes.has(itemCode)) continue;
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
      const row = draftRow({
        sourceRef: order.id,
        invoiceNo,
        invoiceDate: order.createdAt,
        itemCode,
        itemName: line.itemName?.trim() || itemCode,
        quantity: line.quantity,
        unitPrice: Number.isFinite(line.unitPrice) ? line.unitPrice : 0,
        profile,
        currency: order.currency,
        paymentMethod: order.paymentMethod,
        location: order.location,
        merchant: order.merchant,
      });
      if (row) rows.push(row);
    }
  }

  for (const invoice of input.adaptInvoices) {
    const contact = matchContact(invoice.phone, invoice.email, index);
    const profile = profileFor(
      {
        customerName: invoice.customerName,
        phone: invoice.phone,
        email: invoice.email,
        address: invoice.address,
        city: invoice.city,
        district: invoice.district,
      },
      contact,
    );
    for (const line of invoice.lines) {
      const itemCode = line.itemCode?.trim() ?? "";
      if (!itemCode || !codes.has(itemCode)) continue;
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
      const row = draftRow({
        sourceRef: invoice.adaptInvoiceKey,
        invoiceNo: invoice.salesInvoiceNo,
        invoiceDate: invoice.invoiceDate,
        itemCode,
        itemName: line.itemName?.trim() || itemCode,
        quantity: line.quantity,
        unitPrice: Number.isFinite(line.unitPrice) ? line.unitPrice : 0,
        profile,
        currency: invoice.currency,
        paymentMethod: invoice.paymentMethod,
        location: invoice.location,
        merchant: invoice.merchant,
      });
      if (row) rows.push(row);
    }
  }

  return rows;
}
