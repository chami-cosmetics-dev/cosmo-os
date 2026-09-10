import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { computeLifetimeTotal, customerLifetimeTotalOrderWhere } from "@/lib/customer-insight/lifetime-total";
import {
  getLoyaltyProfileMissingFields,
  loyaltyProfileIncompleteMessage,
} from "@/lib/customer-insight/loyalty-profile-complete";
import { canAssignOrUpgradeLoyaltyTier } from "@/lib/customer-insight/loyalty-outreach";
import {
  missingErpLoyaltyMessage,
  preflightLoyaltyErpCustomers,
  pushLoyaltyAssignmentToErpAndShopify,
} from "@/lib/customer-insight/loyalty-push";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import {
  customerInsightContactParamsSchema,
  customerInsightLoyaltyAssignBodySchema,
} from "@/lib/validation/customer-insight";

type Params = { params: Promise<{ contactId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAnyPermission([
    "contacts.master.manage",
    "dashboard.merchant_admin_view",
  ]);
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
  const parsed = customerInsightLoyaltyAssignBodySchema.safeParse(body);
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
      phoneNumber: true,
      email: true,
      gender: true,
      language: true,
      birthMonth: true,
      birthDay: true,
      city: true,
      address: true,
      loyaltyOutreachStatus: true,
      loyaltyAssignedTier: true,
      phones: { select: { phoneNumber: true } },
    },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (contact.loyaltyAssignedTier === "platinum") {
    return NextResponse.json({ error: "Already assigned" }, { status: 409 });
  }
  const isRetrySameTier = contact.loyaltyAssignedTier === parsed.data.tier;
  const isPlatinumUpgrade =
    contact.loyaltyAssignedTier === "gold" && parsed.data.tier === "platinum";
  if (
    !isRetrySameTier &&
    !isPlatinumUpgrade &&
    contact.loyaltyAssignedTier
  ) {
    return NextResponse.json({ error: "Already assigned" }, { status: 409 });
  }
  if (
    !isRetrySameTier &&
    contact.loyaltyOutreachStatus !== "responded"
  ) {
    return NextResponse.json(
      { error: "Customer must be in Responded status" },
      { status: 400 }
    );
  }

  const profileMissing = getLoyaltyProfileMissingFields({
    name: contact.name,
    email: contact.email,
    phoneNumber: contact.phoneNumber,
    phones: contact.phones.map((p) => p.phoneNumber),
    gender: contact.gender,
    language: contact.language,
    birthMonth: contact.birthMonth,
    birthDay: contact.birthDay,
    city: contact.city,
    address: contact.address,
  });
  if (profileMissing.length > 0) {
    return NextResponse.json(
      {
        error: loyaltyProfileIncompleteMessage(profileMissing),
        missingFields: profileMissing,
      },
      { status: 400 }
    );
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
      where: { contactId: contact.id, companyId },
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
    !isRetrySameTier &&
    !canAssignOrUpgradeLoyaltyTier({
      tier: parsed.data.tier,
      lifetimeTotal,
      currentAssigned: contact.loyaltyAssignedTier,
    })
  ) {
    return NextResponse.json(
      {
        error: `Lifetime total ${lifetimeTotal} does not match ${parsed.data.tier} band`,
        lifetimeTotal,
      },
      { status: 400 }
    );
  }

  const remark = parsed.data.remark?.trim() || null;

  const preflight = await preflightLoyaltyErpCustomers({
    companyId,
    contactId: contact.id,
  });
  if (preflight.errors.includes("Contact not found")) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (preflight.missingErpSlots.length > 0) {
    const error = missingErpLoyaltyMessage(
      preflight.missingErpSlots,
      preflight.primaryPhone
    );
    return NextResponse.json(
      {
        error,
        missingErpSlots: preflight.missingErpSlots,
        retry: true,
      },
      { status: 400 }
    );
  }
  if (preflight.errors.length > 0) {
    return NextResponse.json(
      { error: preflight.errors[0], details: preflight.errors },
      { status: 400 }
    );
  }

  const now = new Date();

  if (!isRetrySameTier) {
    await prisma.$transaction(async (tx) => {
      await tx.contactMaster.update({
        where: { id: contact.id },
        data: {
          loyaltyAssignedTier: parsed.data.tier,
          loyaltyAssignedAt: now,
          loyaltyAssignedByUserId: user.id,
          loyaltyOutreachStatus: "assigned",
        },
      });
      await tx.contactAllocationUpdate.create({
        data: {
          companyId,
          contactId: contact.id,
          merchantId: user.id,
          merchantName: user.knownName ?? user.name ?? null,
          category: "Contacted",
          remark,
          outcome: "responded",
        },
      });
    });
  }

  let push = {
    erpUpdated: 0,
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
          push.errors.find((e) => e.includes("Create this customer")) ??
          missingErpLoyaltyMessage(push.missingErpSlots, preflight.primaryPhone),
        missingErpSlots: push.missingErpSlots,
        retry: true,
        erpUpdated: push.erpUpdated,
        shopifyUpdated: push.shopifyUpdated,
        pushErrors: push.errors,
      },
      { status: 400 }
    );
  }

  await writeAuditLog({
    companyId,
    actorUserId: user.id,
    module: "customer-insight",
    action: isRetrySameTier ? "loyalty_push_retry" : "loyalty_assigned",
    entityType: "ContactMaster",
    entityId: contact.id,
    summary: isRetrySameTier
      ? `Retried ${parsed.data.tier} loyalty push for ${contact.name}`
      : `${isPlatinumUpgrade ? "Upgraded" : "Assigned"} ${parsed.data.tier} loyalty to ${contact.name}`,
    metadata: {
      tier: parsed.data.tier,
      lifetimeTotal,
      remark,
      retry: isRetrySameTier,
      erpUpdated: push.erpUpdated,
      shopifyUpdated: push.shopifyUpdated,
      pushErrors: push.errors,
    },
  });

  return NextResponse.json({
    ok: true,
    tier: parsed.data.tier,
    assignedAt: now.toISOString(),
    retry: isRetrySameTier,
    erpUpdated: push.erpUpdated,
    shopifyUpdated: push.shopifyUpdated,
    pushErrors: push.errors,
  });
}
