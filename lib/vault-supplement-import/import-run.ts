import { Prisma } from "@prisma/client";

import {
  findMatchingContacts,
  normalizeContactEmail,
  normalizeContactPhone,
} from "@/lib/contact-identifiers";
import {
  loadPurchaseSummaryIndexes,
  purchaseSummaryForContact,
} from "@/lib/contacts/purchase-summary-export";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { OsfErpError } from "@/lib/osf/erp-stock";

import {
  fillEmptyContactFields,
  resolveContactMatch,
  type ContactProfileFields,
} from "@/lib/vault-supplement-import/contact-resolve";
import { REJECT_REASON } from "@/lib/vault-supplement-import/headers";
import { listVaultErpItemCodes } from "@/lib/vault-supplement-import/item-codes";
import {
  mergeSupplementLines,
  roundMoney,
  supplementInvoiceKey,
  supplementLineId,
  readStoredSupplementLines,
  type SupplementLine,
} from "@/lib/vault-supplement-import/invoice-merge";
import {
  groupPurchaseCustomers,
  parsePurchasesWorkbook,
  type ParsedPurchaseLine,
  type PurchaseCustomerGroup,
  type RejectedPurchaseRow,
} from "@/lib/vault-supplement-import/parse-sheet";

export class SupplementImportError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SupplementImportError";
    this.status = status;
  }
}

export type SupplementImportSummary = {
  rowsRead: number;
  rowsAccepted: number;
  rowsRejected: number;
  contactsCreated: number;
  contactsMatched: number;
  purchaseLinesAdded: number;
  purchaseLinesUpdated: number;
  rejected: RejectedPurchaseRow[];
};

const WRITE_CHUNK = 200;

function latestInvoiceDate(lines: ParsedPurchaseLine[]): Date {
  return lines.reduce(
    (latest, line) => (line.invoiceDate > latest ? line.invoiceDate : latest),
    lines[0]!.invoiceDate,
  );
}

function toSupplementLine(adaptInvoiceKey: string, line: ParsedPurchaseLine): SupplementLine {
  return {
    id: supplementLineId(adaptInvoiceKey, line.itemCode),
    itemCode: line.itemCode,
    itemName: line.itemName,
    quantity: line.quantity,
    unitPrice: String(line.unitPrice),
    lineAmount: String(roundMoney(line.lineAmount)),
    itemId: null,
  };
}

async function ensurePrimaryPhone(contactId: string, phone: string | null) {
  if (!phone) return;
  const variants = buildPhoneLookupVariants(phone);
  const existing = await prisma.contactPhone.findFirst({
    where: {
      contactId,
      phoneNumber: { in: variants.length > 0 ? variants : [phone] },
    },
    select: { id: true },
  });
  if (existing) return;
  await prisma.contactPhone.create({
    data: { contactId, phoneNumber: phone, isPrimary: true },
  });
}

async function ensurePrimaryEmail(contactId: string, email: string | null) {
  if (!email) return;
  const existing = await prisma.contactEmail.findFirst({
    where: { contactId, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return;
  await prisma.contactEmail.create({
    data: { contactId, email, isPrimary: true },
  });
}

async function refreshPurchaseSummaries(companyId: string, contactIds: string[]) {
  if (contactIds.length === 0) return;
  const indexes = await loadPurchaseSummaryIndexes(companyId);
  const contacts = await prisma.contactMaster.findMany({
    where: { companyId, id: { in: contactIds } },
    select: {
      id: true,
      phoneNumber: true,
      email: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });

  for (let offset = 0; offset < contacts.length; offset += WRITE_CHUNK) {
    const chunk = contacts.slice(offset, offset + WRITE_CHUNK);
    await prisma.$transaction(
      chunk.map((contact) => {
        const summary = purchaseSummaryForContact(indexes, {
          contactId: contact.id,
          phoneNumber: contact.phoneNumber,
          email: contact.email,
          aliasPhones: contact.phones.map((row) => row.phoneNumber),
          aliasEmails: contact.emails.map((row) => row.email),
        });
        return prisma.contactMaster.update({
          where: { id: contact.id },
          data: {
            purchaseOrderCount: summary?.orderCount ?? 0,
            purchaseTotalValue: new Prisma.Decimal(summary?.totalSpent ?? 0),
            purchaseLastOrderAt: summary?.lastOrderAt ?? null,
          },
        });
      }),
    );
  }
}

async function upsertInvoices(input: {
  companyId: string;
  contactId: string;
  importBatchId: string;
  lines: ParsedPurchaseLine[];
}): Promise<{ added: number; updated: number }> {
  const groups = new Map<string, ParsedPurchaseLine[]>();
  for (const line of input.lines) {
    const key = supplementInvoiceKey(line.sourceRef, line.invoiceNo);
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }

  let added = 0;
  let updated = 0;
  const entries = [...groups.entries()];
  for (let offset = 0; offset < entries.length; offset += WRITE_CHUNK) {
    const chunk = entries.slice(offset, offset + WRITE_CHUNK);
    for (const [adaptInvoiceKey, lines] of chunk) {
      const existing = await prisma.adaptPurchaseHistory.findUnique({
        where: { companyId_adaptInvoiceKey: { companyId: input.companyId, adaptInvoiceKey } },
        select: { lineItems: true },
      });
      const incoming = lines.map((line) => toSupplementLine(adaptInvoiceKey, line));
      const merged = mergeSupplementLines(readStoredSupplementLines(existing?.lineItems), incoming);
      added += merged.added;
      updated += merged.updated;
      const last = lines[lines.length - 1]!;
      const data = {
        contactId: input.contactId,
        salesInvoiceNo: last.invoiceNo,
        invoiceDate: latestInvoiceDate(lines),
        ttlAmount: new Prisma.Decimal(merged.ttlAmount.toFixed(2)),
        currency: last.currency,
        locationName: last.location,
        paymentMethod: last.paymentMethod,
        merchantKnownName: last.merchant,
        lineItems: merged.lines,
        importBatchId: input.importBatchId,
        origin: "vault_supplement_import",
      };
      if (existing) {
        await prisma.adaptPurchaseHistory.update({
          where: { companyId_adaptInvoiceKey: { companyId: input.companyId, adaptInvoiceKey } },
          data,
        });
      } else {
        await prisma.adaptPurchaseHistory.create({
          data: {
            companyId: input.companyId,
            adaptInvoiceKey,
            ...data,
          },
        });
      }
    }
  }
  return { added, updated };
}

async function persistCustomer(input: {
  companyId: string;
  importBatchId: string;
  group: PurchaseCustomerGroup;
  contactId: string | null;
}): Promise<{ created: boolean; contactId: string; added: number; updated: number }> {
  const phone = normalizeContactPhone(input.group.phone);
  const email = normalizeContactEmail(input.group.email);
  const incoming: ContactProfileFields = {
    name: input.group.name,
    phoneNumber: phone,
    email,
    address: input.group.address,
    city: input.group.city,
    district: input.group.district,
  };
  const latest = latestInvoiceDate(input.group.lines);

  if (!input.contactId) {
    const contact = await prisma.contactMaster.create({
      data: {
        companyId: input.companyId,
        name: input.group.name,
        phoneNumber: phone,
        email,
        address: input.group.address,
        city: input.group.city,
        district: input.group.district,
        source: "vault-supplement-import",
        osRegistrationCreated: false,
        lastPurchaseAt: latest,
      },
      select: { id: true },
    });
    await ensurePrimaryPhone(contact.id, phone);
    await ensurePrimaryEmail(contact.id, email);
    const counts = await upsertInvoices({
      companyId: input.companyId,
      contactId: contact.id,
      importBatchId: input.importBatchId,
      lines: input.group.lines,
    });
    return { created: true, contactId: contact.id, ...counts };
  }

  const existing = await prisma.contactMaster.findFirst({
    where: { id: input.contactId, companyId: input.companyId },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      address: true,
      city: true,
      district: true,
      lastPurchaseAt: true,
    },
  });
  if (!existing) {
    throw new SupplementImportError("Matched contact was not found", 500);
  }

  const patch = fillEmptyContactFields(existing, incoming);
  const moveLastPurchase = !existing.lastPurchaseAt || latest > existing.lastPurchaseAt;
  const data: Prisma.ContactMasterUpdateInput = {};
  if (patch.name) data.name = patch.name;
  if (patch.phoneNumber) data.phoneNumber = patch.phoneNumber;
  if (patch.email) data.email = patch.email;
  if (patch.address) data.address = patch.address;
  if (patch.city) data.city = patch.city;
  if (patch.district) data.district = patch.district;
  if (moveLastPurchase) data.lastPurchaseAt = latest;
  await prisma.contactMaster.update({
    where: { id: existing.id },
    data,
  });
  if (patch.phoneNumber) await ensurePrimaryPhone(existing.id, phone);
  if (patch.email) await ensurePrimaryEmail(existing.id, email);
  const counts = await upsertInvoices({
    companyId: input.companyId,
    contactId: existing.id,
    importBatchId: input.importBatchId,
    lines: input.group.lines,
  });
  return { created: false, contactId: existing.id, ...counts };
}

export async function importSupplementPurchases(input: {
  companyId: string;
  file: Buffer;
}): Promise<SupplementImportSummary> {
  const parsed = await parsePurchasesWorkbook(input.file);
  if (!parsed.ok) {
    throw new SupplementImportError(parsed.error, 409);
  }

  let itemCodes: Set<string>;
  try {
    itemCodes = await listVaultErpItemCodes(input.companyId);
  } catch (error) {
    const message = error instanceof OsfErpError || error instanceof Error
      ? error.message
      : "Supplement Vault ERP item list could not be loaded";
    throw new SupplementImportError(message, 502);
  }

  const rejected = [...parsed.rejected];
  const acceptedLines: ParsedPurchaseLine[] = [];
  for (const line of parsed.lines) {
    if (!itemCodes.has(line.itemCode)) {
      rejected.push({ rowNumber: line.rowNumber, reason: REJECT_REASON.unknownItem });
    } else {
      acceptedLines.push(line);
    }
  }

  const customers = groupPurchaseCustomers(acceptedLines);
  const importBatchId = `vsupp-${Date.now()}`;
  const touchedContactIds: string[] = [];
  let contactsCreated = 0;
  let contactsMatched = 0;
  let purchaseLinesAdded = 0;
  let purchaseLinesUpdated = 0;
  let rowsAccepted = 0;

  for (const group of customers) {
    const phone = normalizeContactPhone(group.phone);
    const email = normalizeContactEmail(group.email);
    const matches = await findMatchingContacts(input.companyId, email, phone);
    const resolved = resolveContactMatch({
      phoneMatches: matches.phoneMatches,
      emailMatches: matches.emailMatches,
    });
    if (!resolved.ok) {
      for (const line of group.lines) {
        rejected.push({ rowNumber: line.rowNumber, reason: resolved.reason });
      }
      continue;
    }

    const saved = await persistCustomer({
      companyId: input.companyId,
      importBatchId,
      group,
      contactId: resolved.action === "match" ? resolved.contactId : null,
    });
    if (saved.created) contactsCreated += 1;
    else contactsMatched += 1;
    purchaseLinesAdded += saved.added;
    purchaseLinesUpdated += saved.updated;
    rowsAccepted += group.lines.length;
    touchedContactIds.push(saved.contactId);
  }

  await refreshPurchaseSummaries(input.companyId, [...new Set(touchedContactIds)]);

  rejected.sort((a, b) => a.rowNumber - b.rowNumber || a.reason.localeCompare(b.reason));

  return {
    rowsRead: parsed.rowsRead,
    rowsAccepted,
    rowsRejected: rejected.length,
    contactsCreated,
    contactsMatched,
    purchaseLinesAdded,
    purchaseLinesUpdated,
    rejected,
  };
}
