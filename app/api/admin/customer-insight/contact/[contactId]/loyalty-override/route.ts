import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import {
  canManualAssignLoyaltyTier,
  CONTACTS_LOYALTY_MANUAL_ASSIGN,
} from "@/lib/customer-insight/loyalty-manual";
import { saveLoyaltyReasonTemplate } from "@/lib/customer-insight/loyalty-reason-templates";
import {
  missingErpLoyaltyMessage,
  preflightLoyaltyErpCustomers,
  pushLoyaltyAssignmentToErpAndShopify,
} from "@/lib/customer-insight/loyalty-push";
import {
  adaptSaleTotalWhere,
  computeLifetimeTotal,
  customerLifetimeTotalOrderWhere,
} from "@/lib/customer-insight/lifetime-total";
import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  customerInsightContactParamsSchema,
  customerInsightLoyaltyOverrideBodySchema,
} from "@/lib/validation/customer-insight";

type Params = { params: Promise<{ contactId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requirePermission(CONTACTS_LOYALTY_MANUAL_ASSIGN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const user = auth.context!.user;
  if (!companyId || !user) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { contactId } = await params;
  const idParsed = customerInsightContactParamsSchema.safeParse({ contactId });
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: idParsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = customerInsightLoyaltyOverrideBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id: idParsed.data.contactId, companyId },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      loyaltyAssignedTier: true,
    },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const emails = await listContactEmails(contact.id, contact.email);
  const phones = await listContactPhones(contact.id, contact.phoneNumber);
  const orderLookupOr = buildContactOrderLookupOr({ phones, emails });
  const [orders, adaptRows] = await Promise.all([
    orderLookupOr.length > 0
      ? prisma.order.findMany({
          where: { companyId, OR: orderLookupOr, ...customerLifetimeTotalOrderWhere() },
          select: {
            totalPrice: true,
            cancelledAt: true,
            financialStatus: true,
            fulfillmentStage: true,
          },
        })
      : Promise.resolve([]),
    prisma.adaptPurchaseHistory.findMany({
      where: { contactId: contact.id, companyId, ...adaptSaleTotalWhere() },
      select: { ttlAmount: true },
    }),
  ]);
  const lifetimeTotal = computeLifetimeTotal({
    orders: orders.map((o) => ({
      totalPrice: o.totalPrice.toString(),
      cancelledAt: o.cancelledAt,
      financialStatus: o.financialStatus,
      fulfillmentStage: o.fulfillmentStage,
    })),
    adaptRows: adaptRows.map((r) => ({ ttlAmount: r.ttlAmount.toString() })),
  });

  if (
    !canManualAssignLoyaltyTier({
      tier: parsed.data.tier,
      currentAssigned: contact.loyaltyAssignedTier,
      lifetimeTotal,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "This contact already holds that tier, or they meet the spend rule so use the normal loyalty assign path",
        lifetimeTotal,
      },
      { status: 400 }
    );
  }

  const savedReason = await saveLoyaltyReasonTemplate({
    companyId,
    label: parsed.data.reason,
  });
  if ("error" in savedReason) {
    return NextResponse.json({ error: savedReason.error }, { status: 400 });
  }
  const reason = savedReason.label;

  const preflight = await preflightLoyaltyErpCustomers({
    companyId,
    contactId: contact.id,
  });
  if (preflight.errors.includes("Contact not found")) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (preflight.errors.length > 0) {
    return NextResponse.json(
      { error: preflight.errors[0], details: preflight.errors },
      { status: 400 }
    );
  }

  const now = new Date();
  let push = {
    erpUpdated: 0,
    erpCreated: 0,
    shopifyUpdated: 0,
    errors: [] as string[],
    missingErpSlots: [] as string[],
    blockedForMissingErp: false,
  };
  try {
    push = await pushLoyaltyAssignmentToErpAndShopify({
      companyId,
      contactId: contact.id,
      tier: parsed.data.tier,
    });
  } catch (err) {
    push.errors.push(err instanceof Error ? err.message : "ERP/Shopify push failed");
  }

  if (push.blockedForMissingErp) {
    return NextResponse.json(
      {
        error:
          push.errors.find((e) => e.includes("Could not create this customer")) ??
          missingErpLoyaltyMessage(push.missingErpSlots, preflight.primaryPhone),
        missingErpSlots: push.missingErpSlots,
        retry: true,
        erpUpdated: push.erpUpdated,
        erpCreated: push.erpCreated,
        shopifyUpdated: push.shopifyUpdated,
        pushErrors: push.errors,
      },
      { status: 400 }
    );
  }

  const isPlatinumUpgrade =
    contact.loyaltyAssignedTier === "gold" && parsed.data.tier === "platinum";

  await prisma.$transaction(async (tx) => {
    await tx.contactMaster.update({
      where: { id: contact.id },
      data: {
        loyaltyAssignedTier: parsed.data.tier,
        loyaltyAssignedAt: now,
        loyaltyAssignedByUserId: user.id,
        loyaltyAssignedReason: reason,
        loyaltyOutreachStatus: "assigned",
        loyaltyOutreachUpdatedAt: now,
      },
    });
    await tx.contactAllocationUpdate.create({
      data: {
        companyId,
        contactId: contact.id,
        merchantId: user.id,
        merchantName: user.knownName ?? user.name ?? null,
        category: "Contacted",
        remark: reason,
        outcome: "loyalty_manual",
      },
    });
  });

  await writeAuditLog({
    companyId,
    actorUserId: user.id,
    module: "customer-insight",
    action: "loyalty_manual_assigned",
    entityType: "ContactMaster",
    entityId: contact.id,
    summary: `${isPlatinumUpgrade ? "Manually upgraded" : "Manually assigned"} ${parsed.data.tier} loyalty to ${contact.name} (${reason})`,
    metadata: {
      tier: parsed.data.tier,
      reason,
      lifetimeTotal,
      peerSynced: savedReason.peerSynced,
      peerError: savedReason.peerError,
      erpUpdated: push.erpUpdated,
      erpCreated: push.erpCreated,
      shopifyUpdated: push.shopifyUpdated,
      pushErrors: push.errors,
    },
  });

  return NextResponse.json({
    ok: true,
    tier: parsed.data.tier,
    reason,
    assignedAt: now.toISOString(),
    peerSynced: savedReason.peerSynced,
    peerError: savedReason.peerError,
    erpUpdated: push.erpUpdated,
    erpCreated: push.erpCreated,
    shopifyUpdated: push.shopifyUpdated,
    pushErrors: push.errors,
  });
}
