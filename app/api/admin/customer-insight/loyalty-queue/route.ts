import { NextResponse } from "next/server";

import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { computeLifetimeTotal } from "@/lib/customer-insight/lifetime-total";
import { suggestedLoyaltyTier } from "@/lib/customer-insight/loyalty-outreach";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requireAnyPermission([
    "contacts.master.read",
    "contacts.master.manage",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId,
      loyaltyOutreachStatus: "responded",
      loyaltyAssignedTier: null,
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      assignedMerchant: true,
      email: true,
    },
    take: 200,
    orderBy: { updatedAt: "desc" },
  });

  const items = [];
  for (const c of contacts) {
    const emails = await listContactEmails(c.id, c.email);
    const phones = await listContactPhones(c.id, c.phoneNumber);
    const orderLookupOr = buildContactOrderLookupOr({ phones, emails });
    const [orders, adaptRows] = await Promise.all([
      orderLookupOr.length > 0
        ? prisma.order.findMany({
            where: { companyId, OR: orderLookupOr },
            select: { totalPrice: true, cancelledAt: true },
          })
        : Promise.resolve([]),
      prisma.adaptPurchaseHistory.findMany({
        where: { contactId: c.id, companyId },
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
    items.push({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      lifetimeTotal,
      suggestedTier: suggestedLoyaltyTier(lifetimeTotal),
      assignedMerchant: c.assignedMerchant,
    });
  }

  return NextResponse.json({ items });
}
