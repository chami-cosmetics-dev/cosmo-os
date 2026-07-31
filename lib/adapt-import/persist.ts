import { Prisma } from "@prisma/client";

import {
  buildContactFillBlanksPatch,
  hasFillBlanksChanges,
} from "@/lib/adapt-import/fill-blanks";
import { buildAdaptInvoiceKey } from "@/lib/adapt-import/invoice-identity";
import type { AdaptClassifyResult } from "@/lib/adapt-import/types";
import {
  ensureSecondaryContactIdentifiers,
  normalizeContactEmail,
  normalizeContactPhone,
} from "@/lib/contact-identifiers";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";

type OkClassify = Extract<AdaptClassifyResult, { status: "ok" }>;

export type PersistAdaptRowResult =
  | { status: "skipped_purchase"; contactId: string | null; contactAction: "none" | "created" | "enriched" }
  | {
      status: "upserted";
      contactId: string;
      contactAction: "none" | "created" | "enriched";
      purchaseId: string;
    };

async function updatePurchaseSnapshot(input: {
  contactId: string;
  occurredAt: Date;
  recentMerchant: string | null;
  db: typeof prisma;
}) {
  const merchant = input.recentMerchant?.trim().slice(0, LIMITS.knownName.max) || null;
  await db.contactMaster.updateMany({
    where: {
      id: input.contactId,
      OR: [{ lastPurchaseAt: null }, { lastPurchaseAt: { lt: input.occurredAt } }],
    },
    data: {
      lastPurchaseAt: input.occurredAt,
      ...(merchant ? { recentMerchant: merchant } : {}),
    },
  });
}

/** Upsert Adapt purchase history + fill-blanks contact. Never creates Order. Never sets assignedMerchant. */
export async function persistAdaptPurchaseRow(input: {
  companyId: string;
  classified: OkClassify;
  companyLocationId: string | null;
  contactId?: string | null;
  dryRun?: boolean;
  importBatchId?: string | null;
  db?: typeof prisma;
}): Promise<PersistAdaptRowResult> {
  const db = input.db ?? prisma;
  const classified = input.classified;
  const email = normalizeContactEmail(classified.email);
  const phone = normalizeContactPhone(classified.phone);

  let contactId = input.contactId ?? null;
  let contactAction: "none" | "created" | "enriched" = "none";

  if (!contactId) {
    const createPatch = buildContactFillBlanksPatch(null, {
      name: classified.name,
      email,
      phone,
      address: classified.address,
      district: classified.district,
      zone: classified.zone,
      nearestOutlet: classified.nearestOutlet,
      remarks: classified.remarks,
    });
    if (input.dryRun) {
      if (classified.enrichOnly) {
        return { status: "skipped_purchase", contactId: null, contactAction: "created" };
      }
      return {
        status: "upserted",
        contactId: "dry-run-contact",
        contactAction: "created",
        purchaseId: "dry-run",
      };
    }
    const created = await db.contactMaster.create({
      data: {
        companyId: input.companyId,
        name: createPatch.name ?? "Adapt Customer",
        email: createPatch.email ?? null,
        phoneNumber: createPatch.phoneNumber ?? null,
        address: createPatch.address ?? null,
        district: createPatch.district ?? null,
        zone: createPatch.zone ?? null,
        town: createPatch.town ?? null,
        remarks: createPatch.remarks ?? null,
        source: "adapt",
      },
      select: { id: true },
    });
    contactId = created.id;
    contactAction = "created";
    await ensureSecondaryContactIdentifiers(
      {
        contactId,
        primaryEmail: createPatch.email,
        primaryPhoneNumber: createPatch.phoneNumber,
        email,
        phoneNumber: phone,
      },
      db
    );
  } else {
    const existing = await db.contactMaster.findFirst({
      where: { id: contactId, companyId: input.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        address: true,
        district: true,
        zone: true,
        town: true,
        remarks: true,
        source: true,
      },
    });
    if (!existing) {
      throw new Error(`Contact ${contactId} not found for company`);
    }
    const patch = buildContactFillBlanksPatch(existing, {
      name: classified.name,
      email,
      phone,
      address: classified.address,
      district: classified.district,
      zone: classified.zone,
      nearestOutlet: classified.nearestOutlet,
      remarks: classified.remarks,
    });
    if (hasFillBlanksChanges(patch) && !input.dryRun) {
      await db.contactMaster.update({
        where: { id: contactId },
        data: patch,
      });
      contactAction = "enriched";
    } else if (hasFillBlanksChanges(patch) && input.dryRun) {
      contactAction = "enriched";
    }
    if (!input.dryRun) {
      await ensureSecondaryContactIdentifiers(
        {
          contactId,
          primaryEmail: existing.email,
          primaryPhoneNumber: existing.phoneNumber,
          email,
          phoneNumber: phone,
        },
        db
      );
    }
  }

  if (classified.enrichOnly) {
    return { status: "skipped_purchase", contactId, contactAction };
  }

  const adaptInvoiceKey = buildAdaptInvoiceKey({
    salesInvoiceMasterId: classified.salesInvoiceMasterId,
    salesInvoiceNo: classified.salesInvoiceNo,
    salesLocationId: classified.salesLocationId,
    invoiceDate: classified.invoiceDate,
  });
  if (!adaptInvoiceKey) {
    return { status: "skipped_purchase", contactId, contactAction };
  }

  if (input.dryRun) {
    return { status: "upserted", contactId: contactId!, contactAction, purchaseId: "dry-run" };
  }

  const rawPaymentContext =
    classified.cashAmount || classified.cardAmount
      ? {
          cash: classified.cashAmount,
          card: classified.cardAmount,
        }
      : Prisma.JsonNull;

  const upserted = await db.adaptPurchaseHistory.upsert({
    where: {
      companyId_adaptInvoiceKey: {
        companyId: input.companyId,
        adaptInvoiceKey,
      },
    },
    create: {
      companyId: input.companyId,
      contactId: contactId!,
      companyLocationId: input.companyLocationId,
      adaptInvoiceKey,
      salesInvoiceMasterId: classified.salesInvoiceMasterId,
      salesInvoiceNo: classified.salesInvoiceNo,
      invoiceDate: classified.invoiceDate,
      ttlAmount: new Prisma.Decimal(classified.ttlAmount),
      locationName: classified.locationName,
      salesLocationId: classified.salesLocationId,
      paymentMethod: classified.paymentMethod,
      merchantKnownName: classified.merchantKnownName,
      adaptMerchantId: classified.adaptMerchantId,
      adaptCustomerMasterId: classified.adaptCustomerMasterId,
      rawPaymentContext,
      importBatchId: input.importBatchId ?? null,
    },
    update: {
      contactId: contactId!,
      companyLocationId: input.companyLocationId,
      salesInvoiceMasterId: classified.salesInvoiceMasterId,
      salesInvoiceNo: classified.salesInvoiceNo,
      invoiceDate: classified.invoiceDate,
      ttlAmount: new Prisma.Decimal(classified.ttlAmount),
      locationName: classified.locationName,
      salesLocationId: classified.salesLocationId,
      paymentMethod: classified.paymentMethod,
      merchantKnownName: classified.merchantKnownName,
      adaptMerchantId: classified.adaptMerchantId,
      adaptCustomerMasterId: classified.adaptCustomerMasterId,
      rawPaymentContext,
      importBatchId: input.importBatchId ?? null,
    },
    select: { id: true },
  });

  await updatePurchaseSnapshot({
    contactId: contactId!,
    occurredAt: classified.invoiceDate,
    recentMerchant: classified.merchantKnownName,
    db,
  });

  return {
    status: "upserted",
    contactId: contactId!,
    contactAction,
    purchaseId: upserted.id,
  };
}
