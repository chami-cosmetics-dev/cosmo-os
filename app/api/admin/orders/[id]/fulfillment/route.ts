import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { getDeliveryUrl, sendOrderSms } from "@/lib/order-sms";

const DEVCARTIFY_ADAPT_URL =
  process.env.DEVCARTIFY_ADAPT_URL ??
  "https://devcartify-stable.fly.dev/api/updateAdaptDetails";
const DEVCARTIFY_ADAPT_KEY =
  process.env.X_ADAPT_KEY ??
  process.env.DEVCARTIFY_ADAPT_KEY ??
  process.env.ADAPT_KEY;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

function getInvoiceNo(order: { orderNumber: string | null; name: string | null; shopifyOrderId: string }): string {
  const normalizedName = order.name?.replace(/^#/, "").trim();
  if (normalizedName && /^\d+$/.test(normalizedName)) return normalizedName;
  if (order.orderNumber?.trim()) return order.orderNumber.trim();
  if (normalizedName) return normalizedName;
  return order.shopifyOrderId;
}

function parseErrorText(text: string, fallback: string): string {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? text;
  } catch {
    return text;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

type ShopifyGraphQLError = { message?: string };
type ShopifyOrderSearchNode = {
  id: string;
  fulfillmentOrders?: {
    edges?: Array<{ node?: { id?: string; status?: string } }>;
  };
};

async function fulfillOrderInShopify({
  shop,
  invoiceNo,
}: {
  shop: string;
  invoiceNo: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return {
      ok: false,
      error: "SHOPIFY_ADMIN_ACCESS_TOKEN is missing in environment variables",
      status: 500,
    };
  }

  const endpoint = `https://${shop}/admin/api/2025-10/graphql.json`;
  const searchQuery = invoiceNo.startsWith("#") ? invoiceNo : `#${invoiceNo}`;
  const orderSearchRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      query: `#graphql
        query getOrder($query: String!) {
          orders(first: 1, query: $query) {
            edges {
              node {
                id
                fulfillmentOrders(first: 10) {
                  edges {
                    node {
                      id
                      status
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: { query: `name:${searchQuery}` },
    }),
  });

  if (!orderSearchRes.ok) {
    const errText = await orderSearchRes.text().catch(() => "");
    return {
      ok: false,
      error: parseErrorText(
        errText,
        `Shopify order lookup failed with status ${orderSearchRes.status}`
      ),
      status: 502,
    };
  }

  const orderSearchJson = (await orderSearchRes.json()) as {
    data?: {
      orders?: { edges?: Array<{ node?: ShopifyOrderSearchNode }> };
    };
    errors?: ShopifyGraphQLError[];
  };
  if (orderSearchJson.errors?.length) {
    return {
      ok: false,
      error: orderSearchJson.errors[0]?.message ?? "Shopify order lookup failed",
      status: 502,
    };
  }

  const orderNode = orderSearchJson.data?.orders?.edges?.[0]?.node;
  if (!orderNode) {
    return {
      ok: false,
      error: `Order #${invoiceNo} not found in Shopify`,
      status: 404,
    };
  }

  const openFulfillmentOrders =
    orderNode.fulfillmentOrders?.edges
      ?.map((edge) => edge.node)
      .filter(
        (node): node is { id: string; status?: string } =>
          Boolean(node?.id) && node?.status === "OPEN"
      )
      .map((node) => ({ fulfillmentOrderId: node.id })) ?? [];

  if (openFulfillmentOrders.length === 0) {
    return { ok: true };
  }

  const fulfillRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      query: `#graphql
        mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment { id }
            userErrors { message }
          }
        }
      `,
      variables: {
        fulfillment: {
          lineItemsByFulfillmentOrder: openFulfillmentOrders,
        },
      },
    }),
  });

  if (!fulfillRes.ok) {
    const errText = await fulfillRes.text().catch(() => "");
    return {
      ok: false,
      error: parseErrorText(
        errText,
        `Shopify fulfillment failed with status ${fulfillRes.status}`
      ),
      status: 502,
    };
  }

  const fulfillJson = (await fulfillRes.json()) as {
    data?: {
      fulfillmentCreate?: {
        fulfillment?: { id?: string | null };
        userErrors?: Array<{ message?: string }>;
      };
    };
    errors?: ShopifyGraphQLError[];
  };
  if (fulfillJson.errors?.length) {
    return {
      ok: false,
      error: fulfillJson.errors[0]?.message ?? "Shopify fulfillment failed",
      status: 502,
    };
  }

  const userErrors = fulfillJson.data?.fulfillmentCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      error: userErrors[0]?.message ?? "Shopify fulfillment failed",
      status: 400,
    };
  }

  const fulfillmentId = fulfillJson.data?.fulfillmentCreate?.fulfillment?.id;
  if (!fulfillmentId) {
    return {
      ok: false,
      error: "Shopify fulfillment failed",
      status: 400,
    };
  }

  return { ok: true };
}

const addSampleSchema = z.object({
  sampleFreeIssueItemId: cuidSchema,
  quantity: z.number().int().min(1).max(99),
});

const fulfillmentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_samples"),
    samples: z.array(addSampleSchema).min(1).max(20),
  }),
  z.object({
    action: z.literal("advance_to_print"),
  }),
  z.object({
    action: z.literal("put_on_hold"),
    holdReasonId: cuidSchema,
  }),
  z.object({
    action: z.literal("mark_ready"),
  }),
  z.object({
    action: z.literal("revert_hold"),
  }),
  z.object({
    action: z.literal("dispatch"),
    riderId: cuidSchema.optional(),
    courierServiceId: cuidSchema.optional(),
  }),
  z.object({
    action: z.literal("mark_invoice_complete"),
  }),
  z.object({
    action: z.literal("mark_delivered"),
  }),
  z.object({
    action: z.literal("complete_pos"),
  }),
  z.object({
    action: z.literal("revert_to_stage"),
    targetStage: z.enum([
      "order_received",
      "sample_free_issue",
      "print",
      "ready_to_dispatch",
      "dispatched",
      "delivery_complete",
    ]),
  }),
]);

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

function getRequiredPermissionsForAction(action: string): string[] {
  switch (action) {
    case "add_samples":
    case "advance_to_print":
      return ["orders.manage", "fulfillment.sample_free_issue.manage"];
    case "put_on_hold":
      return ["orders.manage", "fulfillment.ready_dispatch.put_on_hold"];
    case "mark_ready":
      return ["orders.manage", "fulfillment.ready_dispatch.package_ready"];
    case "revert_hold":
      return ["orders.manage", "fulfillment.ready_dispatch.revert_hold"];
    case "dispatch":
      return ["orders.manage", "fulfillment.ready_dispatch.dispatch"];
    case "mark_delivered":
      return ["orders.manage", "fulfillment.delivery_invoice.mark_delivered"];
    case "mark_invoice_complete":
      return ["orders.manage", "fulfillment.delivery_invoice.mark_complete"];
    case "complete_pos":
    case "revert_to_stage":
      return ["orders.manage"];
    default:
      return ["orders.manage"];
  }
}

const FULFILLMENT_STAGE_ORDER: FulfillmentStage[] = [
  "order_received",
  "sample_free_issue",
  "print",
  "ready_to_dispatch",
  "dispatched",
  "delivery_complete",
  "invoice_complete",
];

function stageToPermissionKey(stage: FulfillmentStage): string {
  return stage === "ready_to_dispatch" ? "ready_dispatch" : stage;
}

function getRequiredRevertPermissions(
  targetStage: FulfillmentStage,
  currentStage: FulfillmentStage
): string[] {
  const targetIdx = FULFILLMENT_STAGE_ORDER.indexOf(targetStage);
  const currentIdx = FULFILLMENT_STAGE_ORDER.indexOf(currentStage);
  if (targetIdx >= currentIdx) return [];
  const perms: string[] = [];
  for (let i = targetIdx; i < currentIdx; i++) {
    perms.push(`fulfillment.revert_to.${stageToPermissionKey(FULFILLMENT_STAGE_ORDER[i])}`);
  }
  return perms;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await request.json().catch(() => ({}));
  const parsed = fulfillmentActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const requiredPermissions = getRequiredPermissionsForAction(parsed.data.action);
  const auth = await requireAnyPermission(requiredPermissions);
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

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    include: {
      packageHoldReason: true,
      sampleFreeIssues: true,
      companyLocation: {
        select: {
          id: true,
          name: true,
          shopifyShopName: true,
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const data = parsed.data;
  const now = new Date();

  try {
    if (data.action === "add_samples") {
      if (order.fulfillmentStage !== "sample_free_issue" && order.fulfillmentStage !== "order_received") {
        return NextResponse.json(
          { error: "Samples can only be added at sample/free issue stage" },
          { status: 400 }
        );
      }

      for (const s of data.samples) {
        const item = await prisma.sampleFreeIssueItem.findFirst({
          where: { id: s.sampleFreeIssueItemId, companyId },
        });
        if (!item) {
          return NextResponse.json(
            { error: `Sample/free issue item not found: ${s.sampleFreeIssueItemId}` },
            { status: 400 }
          );
        }
      }

      for (const s of data.samples) {
        await prisma.orderSampleFreeIssue.upsert({
          where: {
            orderId_sampleFreeIssueItemId: {
              orderId: order.id,
              sampleFreeIssueItemId: s.sampleFreeIssueItemId,
            },
          },
          create: {
            orderId: order.id,
            sampleFreeIssueItemId: s.sampleFreeIssueItemId,
            quantity: s.quantity,
            addedById: auth.context!.user!.id,
          },
          update: { quantity: s.quantity },
        });
      }

      if (order.fulfillmentStage === "order_received") {
        await prisma.order.update({
          where: { id: order.id },
          data: { fulfillmentStage: "sample_free_issue" },
        });
      }

      return NextResponse.json({ success: true });
    }

    if (data.action === "advance_to_print") {
      if (order.fulfillmentStage !== "sample_free_issue" && order.fulfillmentStage !== "order_received") {
        return NextResponse.json(
          { error: "Can only advance to print from sample/free issue stage" },
          { status: 400 }
        );
      }
      await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "print",
          sampleFreeIssueCompleteAt: now,
          sampleFreeIssueCompleteById: auth.context!.user!.id,
        },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "put_on_hold") {
      if (order.fulfillmentStage !== "print" && order.fulfillmentStage !== "ready_to_dispatch") {
        return NextResponse.json(
          { error: "Can only put on hold at ready to dispatch stage" },
          { status: 400 }
        );
      }
      const reason = await prisma.packageHoldReason.findFirst({
        where: { id: data.holdReasonId, companyId },
      });
      if (!reason) {
        return NextResponse.json({ error: "Hold reason not found" }, { status: 400 });
      }
      await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "ready_to_dispatch",
          packageOnHoldAt: now,
          packageHoldReasonId: data.holdReasonId,
          packageReadyAt: null,
        },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "mark_ready") {
      if (order.fulfillmentStage !== "print" && order.fulfillmentStage !== "ready_to_dispatch") {
        return NextResponse.json(
          { error: "Can only mark ready at print or ready to dispatch stage" },
          { status: 400 }
        );
      }
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "ready_to_dispatch",
          packageReadyAt: now,
          packageReadyById: auth.context!.user!.id,
          packageOnHoldAt: null,
          packageHoldReasonId: null,
        },
        include: { companyLocation: true },
      });
      sendOrderSms(companyId, order.id, "package_ready", {
        orderNumber: updated.orderNumber ?? updated.name ?? updated.shopifyOrderId,
        customerPhone: updated.customerPhone ?? undefined,
        locationName: updated.companyLocation.name,
      }).catch((err) => console.error("[Order SMS] package_ready failed:", err));
      return NextResponse.json({ success: true });
    }

    if (data.action === "revert_hold") {
      if (order.fulfillmentStage !== "print" && order.fulfillmentStage !== "ready_to_dispatch") {
        return NextResponse.json(
          { error: "Can only revert hold at ready to dispatch stage" },
          { status: 400 }
        );
      }
      if (!order.packageOnHoldAt) {
        return NextResponse.json(
          { error: "Package is not on hold" },
          { status: 400 }
        );
      }
      await prisma.order.update({
        where: { id: order.id },
        data: {
          packageOnHoldAt: null,
          packageHoldReasonId: null,
        },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "dispatch") {
      if (order.fulfillmentStage !== "ready_to_dispatch") {
        return NextResponse.json(
          { error: "Order must be at ready to dispatch stage" },
          { status: 400 }
        );
      }
      if (!order.packageReadyAt) {
        return NextResponse.json(
          { error: "Package must be marked ready before dispatch" },
          { status: 400 }
        );
      }
      if (data.riderId && data.courierServiceId) {
        return NextResponse.json(
          { error: "Select either rider or courier service, not both" },
          { status: 400 }
        );
      }
      if (!data.riderId && !data.courierServiceId) {
        return NextResponse.json(
          { error: "Select either rider or courier service" },
          { status: 400 }
        );
      }

      let riderDeliveryToken: string | null = null;
      if (data.riderId) {
        const rider = await prisma.user.findFirst({
          where: { id: data.riderId, companyId },
          include: { employeeProfile: true },
        });
        if (!rider?.employeeProfile?.isRider) {
          return NextResponse.json(
            { error: "Selected user is not a rider" },
            { status: 400 }
          );
        }
        riderDeliveryToken = randomBytes(16).toString("hex");
      } else if (data.courierServiceId) {
        const svc = await prisma.courierService.findFirst({
          where: { id: data.courierServiceId, companyId },
        });
        if (!svc) {
          return NextResponse.json({ error: "Courier service not found" }, { status: 400 });
        }
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "dispatched",
          dispatchedAt: now,
          dispatchedById: auth.context!.user!.id,
          dispatchedByRiderId: data.riderId ?? null,
          dispatchedByCourierServiceId: data.courierServiceId ?? null,
          riderDeliveryToken,
        },
        include: {
          companyLocation: true,
          dispatchedByRider: { select: { name: true, mobile: true } },
        },
      });
      const orderNum = updated.orderNumber ?? updated.name ?? updated.shopifyOrderId;
      sendOrderSms(companyId, order.id, "dispatched", {
        orderNumber: orderNum,
        customerPhone: updated.customerPhone ?? undefined,
        locationName: updated.companyLocation.name,
      }).catch((err) => console.error("[Order SMS] dispatched failed:", err));
      if (data.riderId && riderDeliveryToken) {
        const rider = updated.dispatchedByRider as { name: string | null; mobile: string | null } | undefined;
        const deliveryUrl = getDeliveryUrl({ riderDeliveryToken });
        sendOrderSms(companyId, order.id, "rider_dispatched", {
          orderNumber: orderNum,
          riderName: rider?.name ?? undefined,
          riderPhone: rider?.mobile ?? undefined,
          deliveryUrl,
        }).catch((err) => console.error("[Order SMS] rider_dispatched failed:", err));
      }
      return NextResponse.json({ success: true });
    }

    if (data.action === "mark_invoice_complete") {
      if (order.fulfillmentStage !== "delivery_complete") {
        return NextResponse.json(
          { error: "Delivery must be marked complete before invoice complete" },
          { status: 400 }
        );
      }
      const shop = order.companyLocation.shopifyShopName?.trim();
      if (!shop) {
        return NextResponse.json(
          { error: "Shopify shop name is not set for this location" },
          { status: 400 }
        );
      }
      const orderNumber = getInvoiceNo(order);
      if (DEVCARTIFY_ADAPT_KEY) {
        try {
          const adaptRes = await fetch(DEVCARTIFY_ADAPT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Adapt-Key": DEVCARTIFY_ADAPT_KEY,
            },
            body: JSON.stringify({
              invoiceNo: orderNumber,
              shop,
            }),
          });
          if (!adaptRes.ok) {
            const errText = await adaptRes.text().catch(() => "");
            return NextResponse.json(
              {
                error: `Devcartify sync failed (${adaptRes.status}): ${parseErrorText(
                  errText,
                  adaptRes.statusText || "Unknown upstream error"
                )}`,
              },
              { status: 502 }
            );
          }
        } catch (adaptErr) {
          return NextResponse.json(
            {
              error: `Devcartify sync request failed: ${getErrorMessage(
                adaptErr,
                "unknown error"
              )}`,
            },
            { status: 502 }
          );
        }
      } else if (SHOPIFY_ADMIN_ACCESS_TOKEN) {
        const directResult = await fulfillOrderInShopify({ shop, invoiceNo: orderNumber });
        if (!directResult.ok) {
          return NextResponse.json(
            { error: directResult.error },
            { status: directResult.status }
          );
        }
      } else {
        return NextResponse.json(
          {
            error:
              "Set X_ADAPT_KEY (or ADAPT_KEY) for Devcartify sync or SHOPIFY_ADMIN_ACCESS_TOKEN for direct fulfillment",
          },
          { status: 500 }
        );
      }
      await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "invoice_complete",
          fulfillmentStatus: "fulfilled",
          invoiceCompleteAt: now,
          invoiceCompleteById: auth.context!.user!.id,
        },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "mark_delivered") {
      if (order.fulfillmentStage !== "dispatched") {
        return NextResponse.json(
          { error: "Can only mark delivered when order is dispatched" },
          { status: 400 }
        );
      }
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: now,
          deliveryCompleteById: auth.context!.user!.id,
          riderDeliveryToken: null,
        },
        include: { companyLocation: true },
      });
      sendOrderSms(companyId, order.id, "delivery_complete", {
        orderNumber: updated.orderNumber ?? updated.name ?? updated.shopifyOrderId,
        customerPhone: updated.customerPhone ?? undefined,
        locationName: updated.companyLocation.name,
      }).catch((err) => console.error("[Order SMS] delivery_complete failed:", err));
      return NextResponse.json({ success: true });
    }

    if (data.action === "revert_to_stage") {
      const targetStage = data.targetStage as FulfillmentStage;
      const currentStage = order.fulfillmentStage;
      const targetIdx = FULFILLMENT_STAGE_ORDER.indexOf(targetStage);
      const currentIdx = FULFILLMENT_STAGE_ORDER.indexOf(currentStage);
      if (targetIdx >= currentIdx) {
        return NextResponse.json(
          { error: "Target stage must be earlier than current stage" },
          { status: 400 }
        );
      }
      const requiredRevertPerms = getRequiredRevertPermissions(targetStage, currentStage);
      for (const perm of requiredRevertPerms) {
        if (!hasPermission(auth.context!, perm)) {
          return NextResponse.json(
            { error: "Permission denied: missing revert permission for intermediate stage" },
            { status: 403 }
          );
        }
      }
      const clearFromStageIdx = targetIdx + 1;
      const updateData: Parameters<typeof prisma.order.update>[0]["data"] = {
        fulfillmentStage: targetStage,
      };
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("sample_free_issue")) {
        updateData.sampleFreeIssueCompleteAt = null;
        updateData.sampleFreeIssueCompleteById = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("print")) {
        updateData.printCount = 0;
        updateData.lastPrintedAt = null;
        updateData.lastPrintedById = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("ready_to_dispatch")) {
        updateData.packageReadyAt = null;
        updateData.packageReadyById = null;
        updateData.packageOnHoldAt = null;
        updateData.packageHoldReasonId = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("dispatched")) {
        updateData.dispatchedAt = null;
        updateData.dispatchedById = null;
        updateData.dispatchedByRiderId = null;
        updateData.dispatchedByCourierServiceId = null;
        updateData.riderDeliveryToken = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("delivery_complete")) {
        updateData.deliveryCompleteAt = null;
        updateData.deliveryCompleteById = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("invoice_complete")) {
        updateData.invoiceCompleteAt = null;
        updateData.invoiceCompleteById = null;
      }
      await prisma.order.update({
        where: { id: order.id },
        data: updateData,
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "complete_pos") {
      if (order.sourceName !== "pos") {
        return NextResponse.json(
          { error: "Complete POS is only for POS orders" },
          { status: 400 }
        );
      }
      const isPaid = order.financialStatus?.toLowerCase() === "paid";
      const userId = auth.context!.user!.id;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "delivery_complete",
          printCount: { increment: 1 },
          packageReadyAt: now,
          packageReadyById: userId,
          packageOnHoldAt: null,
          packageHoldReasonId: null,
          dispatchedAt: now,
          dispatchedById: userId,
          dispatchedByRiderId: null,
          dispatchedByCourierServiceId: null,
          invoiceCompleteAt: isPaid ? now : now,
          invoiceCompleteById: userId,
          deliveryCompleteAt: now,
          deliveryCompleteById: userId,
          riderDeliveryToken: null,
        },
      });
      return NextResponse.json({ success: true });
    }
  } catch (err) {
    console.error("Fulfillment update error:", err);
    const message = getErrorMessage(err, "Failed to update fulfillment");
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
