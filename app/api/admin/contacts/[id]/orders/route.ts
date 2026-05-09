import { NextRequest, NextResponse } from "next/server";

import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

type Params = { params: Promise<{ id: string }> };

function uniqueDisplayPhones(values: Array<string | null>) {
  const phones: string[] = [];
  const seenVariants = new Set<string>();

  for (const value of values) {
    const phone = value?.trim();
    if (!phone) continue;

    const variants = buildPhoneLookupVariants(phone);
    if (variants.some((variant) => seenVariants.has(variant))) continue;

    phones.push(phone);
    for (const variant of variants) {
      seenVariants.add(variant);
    }
  }

  return phones;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id: auth.context!.user!.id },
    select: { companyId: true },
  });
  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      emails: {
        orderBy: { createdAt: "asc" },
        select: { email: true },
      },
      phones: {
        orderBy: { createdAt: "asc" },
        select: { phoneNumber: true },
      },
    },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!contact.email && !contact.phoneNumber) {
    return NextResponse.json({ contact, orders: [] });
  }

  const emails = await listContactEmails(contact.id, contact.email);
  const phones = await listContactPhones(contact.id, contact.phoneNumber);
  const displayEmails = [
    contact.email,
    ...contact.emails.map((row) => row.email),
  ].filter((value, index, arr): value is string => {
    const normalized = value?.trim().toLowerCase();
    return !!normalized && arr.findIndex((item) => item?.trim().toLowerCase() === normalized) === index;
  });
  const displayPhones = uniqueDisplayPhones([
    contact.phoneNumber,
    ...contact.phones.map((row) => row.phoneNumber),
  ]);

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      OR: [
        ...(emails.length > 0
          ? emails.map((email) => ({ customerEmail: { equals: email, mode: "insensitive" as const } }))
          : []),
        ...(phones.length > 0 ? [{ customerPhone: { in: phones } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      shopifyOrderId: true,
      orderNumber: true,
      name: true,
      totalPrice: true,
      currency: true,
      financialStatus: true,
      fulfillmentStatus: true,
      createdAt: true,
      lineItems: {
        select: {
          id: true,
          quantity: true,
          price: true,
          productItem: {
            select: {
              productTitle: true,
              variantTitle: true,
              sku: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phoneNumber: contact.phoneNumber,
      emails: displayEmails,
      phoneNumbers: displayPhones,
    },
    orders: orders.map((order) => ({
      totalPrice: order.totalPrice.toString(),
      createdAt: order.createdAt.toISOString(),
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      orderNumber: order.orderNumber,
      name: order.name,
      currency: order.currency,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      lineItems: order.lineItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price.toString(),
        productTitle: item.productItem.productTitle,
        variantTitle: item.productItem.variantTitle,
        sku: item.productItem.sku,
      })),
    })),
  });
}
