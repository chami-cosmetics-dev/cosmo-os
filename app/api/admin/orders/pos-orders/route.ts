import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { resolveStoredOrderCustomerName } from "@/lib/erpnext-customer-display-name";

export const dynamic = "force-dynamic";

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
      posProfile: true,
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
    posProfile: string | null;
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

    // For POS orders, erpnextWarehouse = set_warehouse from the Sales Invoice = the POS profile's
    // warehouse. Never fall back to the location's main warehouse — that's a different warehouse.
    const rawWarehouse = o.erpnextWarehouse?.trim();
    const warehouse =
      rawWarehouse && rawWarehouse.toLowerCase() !== "none" ? rawWarehouse : "—";

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
    };
  });

  // Group by company + posProfile — each POS profile maps to one warehouse
  const groupMap = new Map<string, { company: string; posProfile: string | null; warehouse: string; count: number }>();
  for (const o of flat) {
    const key = `${o.company}||${o.posProfile ?? ""}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      groupMap.set(key, { company: o.company, posProfile: o.posProfile, warehouse: o.warehouse, count: 1 });
    }
  }
  const groups = Array.from(groupMap.values()).sort((a, b) =>
    a.company.localeCompare(b.company) || (a.posProfile ?? "").localeCompare(b.posProfile ?? ""),
  );

  return NextResponse.json({ orders: flat, groups, total: flat.length });
}
