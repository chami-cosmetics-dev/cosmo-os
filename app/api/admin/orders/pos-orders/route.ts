import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { resolveStoredOrderCustomerName } from "@/lib/erpnext-customer-display-name";

export const dynamic = "force-dynamic";

function resolveWarehouse(erpnextWarehouse: string | null, locationWarehouse: string | null): string {
  if (erpnextWarehouse && erpnextWarehouse !== "None") return erpnextWarehouse;
  return locationWarehouse ?? "—";
}

export async function GET() {
  const auth = await requireAnyPermission(["orders.read"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const orders = await prisma.order.findMany({
    where: { companyId, sourceName: "erpnext-pos" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      erpnextWarehouse: true,
      fulfillmentStage: true,
      financialStatus: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      totalPrice: true,
      currency: true,
      customerEmail: true,
      customerPhone: true,
      shippingAddress: true,
      billingAddress: true,
      createdAt: true,
      companyLocation: {
        select: {
          id: true,
          name: true,
          erpnextCompany: true,
          erpnextWarehouse: true,
        },
      },
      customer: { select: { firstName: true, lastName: true } },
    },
  });

  type PosOrder = {
    id: string;
    invoiceNo: string | null;
    company: string;
    companyLocationId: string | null;
    companyLocationName: string | null;
    warehouse: string;
    fulfillmentStage: string | null;
    financialStatus: string | null;
    paymentGatewayPrimary: string | null;
    totalPrice: string;
    currency: string | null;
    customerName: string | null;
    customerPhone: string | null;
    createdAt: string;
  };

  const flat: PosOrder[] = orders.map((o) => {
    const company = o.companyLocation?.erpnextCompany ?? o.companyLocation?.name ?? "Unknown";
    const warehouse = resolveWarehouse(
      o.erpnextWarehouse ?? null,
      o.companyLocation?.erpnextWarehouse ?? null,
    );

    let customerName: string | null = null;
    if (o.customer?.firstName || o.customer?.lastName) {
      customerName = [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ").trim() || null;
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
      warehouse,
      fulfillmentStage: o.fulfillmentStage ?? null,
      financialStatus: o.financialStatus ?? null,
      paymentGatewayPrimary: o.paymentGatewayPrimary ?? null,
      totalPrice: o.totalPrice.toString(),
      currency: o.currency ?? null,
      customerName,
      customerPhone: o.customerPhone ?? null,
      createdAt: o.createdAt.toISOString(),
    };
  });

  // Build grouped summary
  const groupMap = new Map<string, { company: string; warehouse: string; count: number }>();
  for (const o of flat) {
    const key = `${o.company}||${o.warehouse}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      groupMap.set(key, { company: o.company, warehouse: o.warehouse, count: 1 });
    }
  }
  const groups = Array.from(groupMap.values()).sort((a, b) =>
    a.company.localeCompare(b.company) || a.warehouse.localeCompare(b.warehouse),
  );

  return NextResponse.json({ orders: flat, groups, total: flat.length });
}
