import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { resolveStoredOrderCustomerName } from "@/lib/erpnext-customer-display-name";
import { limitSchema, pageSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const POS_SOURCE = "erpnext-pos";

type LocationLabel = { id: string; name: string; erpnextCompany: string | null };

type Group = {
  company: string;
  posProfile: string | null;
  warehouse: string;
  count: number;
};

function companyLabel(loc: LocationLabel | null | undefined): string {
  const erp = loc?.erpnextCompany?.trim();
  if (erp) return erp;
  return loc?.name?.trim() || "Unknown";
}

function normalizeWarehouse(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.toLowerCase() !== "none" ? trimmed : "—";
}

function mapGroups(
  rows: Array<{
    companyLocationId: string;
    posProfile: string | null;
    erpnextWarehouse: string | null;
    _count: { _all: number };
  }>,
  locById: Map<string, LocationLabel>,
): Group[] {
  return rows
    .map((g) => ({
      company: companyLabel(locById.get(g.companyLocationId)),
      posProfile: g.posProfile,
      warehouse: normalizeWarehouse(g.erpnextWarehouse),
      count: g._count._all,
    }))
    .sort(
      (a, b) =>
        a.company.localeCompare(b.company) ||
        (a.posProfile ?? "").localeCompare(b.posProfile ?? ""),
    );
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["orders.read"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const pageResult = pageSchema.safeParse(searchParams.get("page"));
  const limitResult = limitSchema.safeParse(searchParams.get("limit"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 25;
  const search = searchParams.get("search")?.trim() ?? "";
  const companyFilter = searchParams.get("company")?.trim() ?? "";
  const warehouseFilter = searchParams.get("warehouse")?.trim() ?? "";
  const posProfileFilter = searchParams.get("pos_profile")?.trim() ?? "";

  const baseWhere: Prisma.OrderWhereInput = {
    companyId,
    sourceName: POS_SOURCE,
  };

  const allGroupRows = await prisma.order.groupBy({
    by: ["companyLocationId", "posProfile", "erpnextWarehouse"],
    where: baseWhere,
    _count: { _all: true },
  });

  const locationIds = [...new Set(allGroupRows.map((g) => g.companyLocationId))];
  const locations = locationIds.length
    ? await prisma.companyLocation.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, name: true, erpnextCompany: true },
      })
    : [];
  const locById = new Map(locations.map((l) => [l.id, l]));

  const allGroups = mapGroups(allGroupRows, locById);

  const companies = [...new Set(allGroups.map((g) => g.company))].sort();
  const groupsForCompany = companyFilter
    ? allGroups.filter((g) => g.company === companyFilter)
    : allGroups;
  const warehouses = [...new Set(groupsForCompany.map((g) => g.warehouse))].sort();
  const groupsForWarehouse = warehouseFilter
    ? groupsForCompany.filter((g) => g.warehouse === warehouseFilter)
    : groupsForCompany;
  const posProfiles = [
    ...new Set(groupsForWarehouse.map((g) => g.posProfile ?? "—")),
  ].sort();

  const andClauses: Prisma.OrderWhereInput[] = [];

  if (companyFilter) {
    const matchingLocIds = locations
      .filter((l) => companyLabel(l) === companyFilter)
      .map((l) => l.id);
    andClauses.push({
      companyLocationId: { in: matchingLocIds.length > 0 ? matchingLocIds : ["__none__"] },
    });
  }

  if (warehouseFilter === "—") {
    andClauses.push({
      OR: [
        { erpnextWarehouse: null },
        { erpnextWarehouse: "" },
        { erpnextWarehouse: { equals: "none", mode: "insensitive" } },
      ],
    });
  } else if (warehouseFilter) {
    andClauses.push({ erpnextWarehouse: warehouseFilter });
  }

  if (posProfileFilter === "—") {
    andClauses.push({
      OR: [{ posProfile: null }, { posProfile: "" }],
    });
  } else if (posProfileFilter) {
    andClauses.push({ posProfile: posProfileFilter });
  }

  if (search) {
    andClauses.push({
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search, mode: "insensitive" } },
        { posProfile: { contains: search, mode: "insensitive" } },
        {
          customer: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  const where: Prisma.OrderWhereInput = {
    ...baseWhere,
    ...(andClauses.length > 0 ? { AND: andClauses } : {}),
  };

  const hasListFilters = Boolean(
    companyFilter || warehouseFilter || posProfileFilter || search,
  );

  const [total, orders, filteredGroupRows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        orderNumber: true,
        erpnextWarehouse: true,
        posProfile: true,
        fulfillmentStage: true,
        financialStatus: true,
        paymentGatewayPrimary: true,
        totalPrice: true,
        currency: true,
        customerEmail: true,
        customerPhone: true,
        shippingAddress: true,
        billingAddress: true,
        createdAt: true,
        assignedMerchantId: true,
        companyLocation: {
          select: {
            id: true,
            name: true,
            erpnextCompany: true,
            erpnextWarehouse: true,
          },
        },
        customer: { select: { firstName: true, lastName: true } },
        approvalRequests: {
          where: { type: "order_cancel_approval", status: "pending" },
          select: { id: true },
          take: 1,
        },
      },
    }),
    hasListFilters
      ? prisma.order.groupBy({
          by: ["companyLocationId", "posProfile", "erpnextWarehouse"],
          where,
          _count: { _all: true },
        })
      : Promise.resolve(null),
  ]);

  const groups = filteredGroupRows ? mapGroups(filteredGroupRows, locById) : allGroups;

  const flat = orders.map((o) => {
    const company = companyLabel(o.companyLocation);
    const warehouse = normalizeWarehouse(o.erpnextWarehouse);

    let customerName: string | null = null;
    if (o.customer?.firstName || o.customer?.lastName) {
      customerName =
        [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ").trim() || null;
    }
    if (!customerName) {
      customerName = resolveStoredOrderCustomerName({
        shippingAddress: o.shippingAddress,
        billingAddress: o.billingAddress,
        rawPayload: null,
      });
    }

    return {
      id: o.id,
      invoiceNo: o.name ?? o.orderNumber ?? null,
      company,
      companyLocationId: o.companyLocation?.id ?? null,
      companyLocationName: o.companyLocation?.name ?? null,
      posProfile: o.posProfile ?? null,
      warehouse,
      fulfillmentStage: o.fulfillmentStage ?? null,
      financialStatus: o.financialStatus ?? null,
      paymentGatewayPrimary: o.paymentGatewayPrimary ?? null,
      totalPrice: o.totalPrice.toString(),
      currency: o.currency ?? null,
      customerName,
      customerPhone: o.customerPhone ?? null,
      createdAt: o.createdAt.toISOString(),
      hasPendingCancelApproval: o.approvalRequests.length > 0,
      assignedMerchantId: o.assignedMerchantId,
    };
  });

  return NextResponse.json({
    orders: flat,
    groups,
    companies,
    warehouses,
    posProfiles,
    total,
    page,
    limit,
  });
}
