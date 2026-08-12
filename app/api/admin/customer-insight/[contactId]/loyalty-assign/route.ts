import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { computeLifetimeTotal } from "@/lib/customer-insight/lifetime-total";
import { canAssignLoyaltyTier } from "@/lib/customer-insight/loyalty-outreach";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  customerInsightContactParamsSchema,
  customerInsightLoyaltyAssignBodySchema,
} from "@/lib/validation/customer-insight";

type Params = { params: Promise<{ contactId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requirePermission("contacts.master.manage");
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
      loyaltyOutreachStatus: true,
      loyaltyAssignedTier: true,
    },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (contact.loyaltyAssignedTier) {
    return NextResponse.json({ error: "Already assigned" }, { status: 409 });
  }
  if (contact.loyaltyOutreachStatus !== "responded") {
    return NextResponse.json(
      { error: "Customer must be in Responded status" },
      { status: 400 }
    );
  }

  const emails = await listContactEmails(contact.id, contact.email);
  const phones = await listContactPhones(contact.id, contact.phoneNumber);
  const orderLookupOr = buildContactOrderLookupOr({ phones, emails });
  const [orders, adaptRows] = await Promise.all([
    orderLookupOr.length > 0
      ? prisma.order.findMany({
          where: { companyId, OR: orderLookupOr },
          select: { totalPrice: true, cancelledAt: true },
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
    })),
    adaptRows: adaptRows.map((r) => ({ ttlAmount: r.ttlAmount.toString() })),
  });

  if (!canAssignLoyaltyTier(parsed.data.tier, lifetimeTotal)) {
    return NextResponse.json(
      {
        error: `Lifetime total ${lifetimeTotal} does not match ${parsed.data.tier} band`,
        lifetimeTotal,
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const remark = parsed.data.remark?.trim() || null;

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

  await writeAuditLog({
    companyId,
    actorUserId: user.id,
    module: "customer-insight",
    action: "loyalty_assigned",
    entityType: "ContactMaster",
    entityId: contact.id,
    summary: `Assigned ${parsed.data.tier} loyalty to ${contact.name}`,
    metadata: {
      tier: parsed.data.tier,
      lifetimeTotal,
      remark,
    },
  });

  return NextResponse.json({
    ok: true,
    tier: parsed.data.tier,
    assignedAt: now.toISOString(),
  });
}
