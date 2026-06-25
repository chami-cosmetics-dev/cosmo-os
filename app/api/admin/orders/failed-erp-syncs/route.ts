import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, pageSchema } from "@/lib/validation";
import {
  buildFailedErpSyncWhere,
  runDueFailedErpSyncRetries,
  scheduleUnscheduledFailedErpSyncs,
} from "@/lib/failed-erp-sync-auto-retry";
import { buildFailedErpPeSyncWhere } from "@/lib/failed-erp-pe-sync";

const failedErpSyncSearchSchema = z.string().trim().max(100).optional();
const failedErpSyncKindSchema = z.enum(["sales_invoice", "payment_entry"]).optional();

export async function GET(request: NextRequest) {
  const auth = await requirePermission("failed_webhooks.read");
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
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const searchResult = failedErpSyncSearchSchema.safeParse(
    request.nextUrl.searchParams.get("search") ?? undefined
  );
  const kindResult = failedErpSyncKindSchema.safeParse(
    request.nextUrl.searchParams.get("kind") ?? undefined
  );
  const kind = kindResult.success ? kindResult.data ?? "sales_invoice" : "sales_invoice";

  try {
    if (kind === "sales_invoice") {
      await scheduleUnscheduledFailedErpSyncs(companyId, 50);
      await runDueFailedErpSyncRetries({ companyId, limit: 5 });
    }
  } catch (error) {
    console.error("[Failed ERP sync auto-retry] Sweep failed during list request", {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 20;
  const skip = (page - 1) * limit;
  const search = searchResult.success ? searchResult.data : undefined;

  if (kind === "payment_entry") {
    const where = buildFailedErpPeSyncWhere(companyId, search);
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { erpPeSyncFailedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          orderNumber: true,
          shopifyOrderId: true,
          customerEmail: true,
          customerPhone: true,
          erpPeSyncError: true,
          erpPeSyncFailedAt: true,
          erpPeSyncMop: true,
          erpnextInvoiceId: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
          financialStatus: true,
          createdAt: true,
          companyLocation: { select: { id: true, name: true } },
        },
      }),
    ]);

    const items = orders.map((o) => ({
      id: o.id,
      name: o.name,
      orderNumber: o.orderNumber,
      shopifyOrderId: o.shopifyOrderId,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      erpPeSyncError: o.erpPeSyncError,
      erpPeSyncFailedAt: o.erpPeSyncFailedAt?.toISOString() ?? null,
      erpPeSyncMop: o.erpPeSyncMop,
      erpnextInvoiceId: o.erpnextInvoiceId,
      paymentGatewayPrimary: o.paymentGatewayPrimary,
      paymentGatewayNames: o.paymentGatewayNames,
      financialStatus: o.financialStatus,
      createdAt: o.createdAt.toISOString(),
      companyLocation: o.companyLocation,
    }));

    return NextResponse.json({ items, total, page, limit, kind });
  }

  const where = buildFailedErpSyncWhere(companyId, search);

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { erpnextSyncFailedAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        orderNumber: true,
        shopifyOrderId: true,
        customerEmail: true,
        customerPhone: true,
        erpnextSyncError: true,
        erpnextSyncFailedAt: true,
        erpnextSyncAutoRetryCount: true,
        erpnextSyncNextAutoRetryAt: true,
        erpnextSyncLastAutoRetryAt: true,
        erpnextInvoiceId: true,
        createdAt: true,
        companyLocation: { select: { id: true, name: true } },
        lineItems: {
          select: {
            productItem: {
              select: {
                sku: true,
                productTitle: true,
                variantTitle: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const items = orders.map((o) => ({
    id: o.id,
    name: o.name,
    orderNumber: o.orderNumber,
    shopifyOrderId: o.shopifyOrderId,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    erpnextSyncError: o.erpnextSyncError,
    erpnextSyncFailedAt: o.erpnextSyncFailedAt?.toISOString() ?? null,
    erpnextSyncAutoRetryCount: o.erpnextSyncAutoRetryCount,
    erpnextSyncNextAutoRetryAt: o.erpnextSyncNextAutoRetryAt?.toISOString() ?? null,
    erpnextSyncLastAutoRetryAt: o.erpnextSyncLastAutoRetryAt?.toISOString() ?? null,
    erpnextInvoiceId: o.erpnextInvoiceId,
    createdAt: o.createdAt.toISOString(),
    companyLocation: o.companyLocation,
    lineItems: o.lineItems.map((li) => ({
      sku: li.productItem.sku,
      productTitle: li.productItem.productTitle,
      variantTitle: li.productItem.variantTitle,
    })),
  }));

  return NextResponse.json({ items, total, page, limit, kind: "sales_invoice" });
}
