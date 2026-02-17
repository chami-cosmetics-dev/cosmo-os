import { NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, limitSchema, pageSchema, sortOrderSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const locationId = request.nextUrl.searchParams.get("location_id");
  const sourceFilter = request.nextUrl.searchParams.get("source");
  const merchantId = request.nextUrl.searchParams.get("merchant_id");
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const fulfillmentStagesParam = request.nextUrl.searchParams.get("fulfillment_stages")?.trim();

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const sortBy = request.nextUrl.searchParams.get("sort_by")?.trim();
  const sortOrderResult = sortOrderSchema.safeParse(request.nextUrl.searchParams.get("sort_order"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 10;
  const sortOrder = sortOrderResult.success ? sortOrderResult.data : "desc";
  const skip = (page - 1) * limit;

  const SORT_FIELDS: Record<string, Prisma.OrderOrderByWithRelationInput> = {
    created: { createdAt: sortOrder },
    total: { totalPrice: sortOrder },
    order_number: { orderNumber: sortOrder },
    name: { name: sortOrder },
    source: { sourceName: sortOrder },
    location: { companyLocation: { name: sortOrder } },
    merchant: { assignedMerchant: { name: sortOrder } },
  };
  const orderBy: Prisma.OrderOrderByWithRelationInput =
    sortBy && sortBy in SORT_FIELDS ? SORT_FIELDS[sortBy]! : { createdAt: "desc" };

  const where: Prisma.OrderWhereInput = { companyId };

  if (locationId) {
    const idResult = cuidSchema.safeParse(locationId);
    if (idResult.success) {
      where.companyLocationId = idResult.data;
    }
  }

  if (sourceFilter === "pos" || sourceFilter === "web") {
    where.sourceName = sourceFilter;
  }

  if (merchantId) {
    const idResult = cuidSchema.safeParse(merchantId);
    if (idResult.success) {
      where.assignedMerchantId = idResult.data;
    }
  }

  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { customerEmail: { contains: search, mode: "insensitive" } },
      { customerPhone: { contains: search, mode: "insensitive" } },
    ];
  }

  const VALID_STAGES = [
    "order_received",
    "sample_free_issue",
    "print",
    "ready_to_dispatch",
    "dispatched",
    "invoice_complete",
    "delivery_complete",
  ] as const;
  if (fulfillmentStagesParam) {
    const stages = fulfillmentStagesParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => VALID_STAGES.includes(s as (typeof VALID_STAGES)[number]));
    if (stages.length > 0) {
      where.fulfillmentStage = { in: stages };
      where.sourceName = "web"; // Exclude POS for stage-specific fulfillment pages
    }
  }

  const [total, orders, locations, merchants] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        companyLocation: { select: { id: true, name: true } },
        assignedMerchant: { select: { id: true, name: true, email: true } },
        packageHoldReason: { select: { id: true, name: true } },
        _count: { select: { lineItems: true } },
      },
    }),
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        companyId,
        OR: [
          { shopifyUserIds: { isEmpty: false } },
          { couponCodes: { isEmpty: false } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const ordersData = orders.map((o) => ({
    id: o.id,
    shopifyOrderId: o.shopifyOrderId,
    orderNumber: o.orderNumber,
    name: o.name,
    sourceName: o.sourceName,
    totalPrice: o.totalPrice.toString(),
    currency: o.currency,
    financialStatus: o.financialStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    createdAt: o.createdAt.toISOString(),
    companyLocation: o.companyLocation,
    assignedMerchant: o.assignedMerchant,
    lineItemCount: o._count.lineItems,
    printCount: o.printCount,
    packageOnHoldAt: o.packageOnHoldAt?.toISOString() ?? null,
    packageHoldReason: o.packageHoldReason,
    fulfillmentStage: o.fulfillmentStage,
  }));

  return NextResponse.json({
    orders: ordersData,
    total,
    page,
    limit,
    locations,
    merchants,
  });
}
