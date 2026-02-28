import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const DEV_TEST_SHOP = "devcartify-test.myshopify.com";
const DEV_TEST_INVOICE_NO = "1026";
const ENABLE_DEV_ORDER_SEED = process.env.ENABLE_DEV_ORDER_SEED === "true";

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function POST() {
  if (!ENABLE_DEV_ORDER_SEED) {
    return NextResponse.json(
      { error: "Dev order seed is disabled. Set ENABLE_DEV_ORDER_SEED=true to enable." },
      { status: 403 }
    );
  }

  const auth = await requirePermission("orders.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const location = await prisma.companyLocation.findFirst({
    where: {
      companyId,
      shopifyShopName: DEV_TEST_SHOP,
    },
    select: { id: true, name: true, shopifyShopName: true },
  });

  if (!location) {
    return NextResponse.json(
      {
        error:
          `No company location found for ${DEV_TEST_SHOP}. ` +
          "Add or update a location and set its Shop name to this myshopify domain first.",
      },
      { status: 400 }
    );
  }

  const shopifyOrderId = `dev-seed-${companyId}-${DEV_TEST_INVOICE_NO}`;
  const now = new Date();

  const order = await prisma.order.upsert({
    where: { shopifyOrderId },
    create: {
      companyId,
      companyLocationId: location.id,
      shopifyOrderId,
      sourceName: "web",
      orderNumber: DEV_TEST_INVOICE_NO,
      name: `#${DEV_TEST_INVOICE_NO}`,
      totalPrice: "199.00",
      subtotalPrice: "199.00",
      totalDiscounts: "0.00",
      totalTax: "0.00",
      totalShipping: "0.00",
      currency: "LKR",
      financialStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      customerEmail: "dev-order@example.com",
      customerPhone: "+94770000000",
      shippingAddress: {
        name: "Dev Customer",
        address1: "123 Test Street",
        city: "Colombo",
        country: "Sri Lanka",
      },
      billingAddress: {
        name: "Dev Customer",
        address1: "123 Test Street",
        city: "Colombo",
        country: "Sri Lanka",
      },
      discountCodes: [],
      discountApplications: [],
      shippingLines: [],
      rawPayload: {
        seededBy: "dev-seed-endpoint",
        seededAt: now.toISOString(),
      },
      fulfillmentStage: "delivery_complete",
    },
    update: {
      companyLocationId: location.id,
      orderNumber: DEV_TEST_INVOICE_NO,
      name: `#${DEV_TEST_INVOICE_NO}`,
      totalPrice: "199.00",
      subtotalPrice: "199.00",
      totalDiscounts: "0.00",
      totalTax: "0.00",
      totalShipping: "0.00",
      currency: "LKR",
      financialStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      customerEmail: "dev-order@example.com",
      customerPhone: "+94770000000",
      shippingAddress: {
        name: "Dev Customer",
        address1: "123 Test Street",
        city: "Colombo",
        country: "Sri Lanka",
      },
      billingAddress: {
        name: "Dev Customer",
        address1: "123 Test Street",
        city: "Colombo",
        country: "Sri Lanka",
      },
      discountCodes: [],
      discountApplications: [],
      shippingLines: [],
      rawPayload: {
        seededBy: "dev-seed-endpoint",
        seededAt: now.toISOString(),
      },
      fulfillmentStage: "delivery_complete",
      invoiceCompleteAt: null,
      invoiceCompleteById: null,
    },
    select: {
      id: true,
      shopifyOrderId: true,
      orderNumber: true,
      name: true,
      fulfillmentStage: true,
      companyLocationId: true,
    },
  });

  return NextResponse.json({
    success: true,
    message:
      "Hardcoded dev order is ready. Open Delivery & Invoice page and mark invoice complete.",
    order,
    location,
  });
}
