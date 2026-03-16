import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

type Params = { params: Promise<{ id: string }> };

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
    select: { id: true, name: true, email: true, phoneNumber: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!contact.email && !contact.phoneNumber) {
    return NextResponse.json({ contact, orders: [] });
  }

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      OR: [
        ...(contact.email
          ? [{ customerEmail: { equals: contact.email, mode: "insensitive" as const } }]
          : []),
        ...(contact.phoneNumber ? [{ customerPhone: contact.phoneNumber }] : []),
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
    },
  });

  return NextResponse.json({
    contact,
    orders: orders.map((order) => ({
      ...order,
      totalPrice: order.totalPrice.toString(),
      createdAt: order.createdAt.toISOString(),
    })),
  });
}
