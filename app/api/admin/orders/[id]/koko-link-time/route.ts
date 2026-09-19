import { NextResponse } from "next/server";

import {
  createOrGetOrderPaymentApproval,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import {
  buildOrderItemFingerprint,
  findDuplicateNoticeSiblings,
  phoneKeyForKokoDuplicate,
  type KokoDuplicateCandidate,
} from "@/lib/koko-duplicate-group";
import {
  canEditKokoLinkTime,
  isErpKokoOrder,
  parseKokoLinkGeneratedAt,
} from "@/lib/koko-order";
import { KOKO_DUPLICATE_LOOKBACK_DAYS } from "@/lib/koko-order";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, kokoLinkTimeConfirmBodySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function loadDuplicateNotice(order: {
  id: string;
  companyId: string;
  customerPhone: string | null;
  createdAt: Date;
  lineItems: Array<{ quantity: number; productItem: { sku: string | null; id: string } }>;
}) {
  const phoneKey = phoneKeyForKokoDuplicate(order.customerPhone);
  const fingerprint = buildOrderItemFingerprint(
    order.lineItems.map((li) => ({
      sku: li.productItem.sku,
      productItemId: li.productItem.id,
      quantity: li.quantity,
    })),
  );
  if (!phoneKey) return [];

  const since = new Date(
    Date.now() - KOKO_DUPLICATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const peers = await prisma.order.findMany({
    where: {
      companyId: order.companyId,
      id: { not: order.id },
      cancelledAt: null,
      NOT: { financialStatus: { equals: "voided", mode: "insensitive" } },
      createdAt: { gte: since },
      OR: [{ paymentGatewayPrimary: { contains: "koko", mode: "insensitive" } }],
    },
    select: {
      id: true,
      createdAt: true,
      customerPhone: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      kokoLinkGeneratedAt: true,
      assignedMerchant: { select: { name: true, email: true } },
      lineItems: {
        select: {
          quantity: true,
          productItem: { select: { id: true, sku: true, productTitle: true } },
        },
      },
      approvalRequests: {
        where: { type: ORDER_PAYMENT_APPROVAL },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
    take: 50,
  });

  const candidates: KokoDuplicateCandidate[] = peers.map((p) => ({
    orderId: p.id,
    approvalId: p.approvalRequests[0]?.id ?? null,
    status: p.approvalRequests[0]?.status ?? "awaiting_link_time",
    createdAt: p.createdAt,
    customerPhone: p.customerPhone,
    phoneKey: phoneKeyForKokoDuplicate(p.customerPhone),
    fingerprint: buildOrderItemFingerprint(
      p.lineItems.map((li) => ({
        sku: li.productItem.sku,
        productItemId: li.productItem.id,
        quantity: li.quantity,
      })),
    ),
    kokoLinkGeneratedAt: p.kokoLinkGeneratedAt,
    invoiceNo: p.name ?? p.orderNumber ?? p.shopifyOrderId,
    merchantLabel: p.assignedMerchant?.name ?? p.assignedMerchant?.email ?? null,
    itemSummary: p.lineItems
      .map((li) => `${li.productItem.sku ?? li.productItem.productTitle}×${li.quantity}`)
      .join(", "),
  }));

  return findDuplicateNoticeSiblings(
    {
      orderId: order.id,
      phoneKey,
      fingerprint,
      createdAt: order.createdAt,
    },
    candidates,
  );
}

export async function GET(_req: Request, { params }: Params) {
  const auth = await requirePermission("fulfillment.sample_free_issue.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 404 });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idParsed.data, companyId },
    select: {
      id: true,
      companyId: true,
      sourceName: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      customerPhone: true,
      createdAt: true,
      kokoLinkGeneratedAt: true,
      kokoLinkTimeConfirmedAt: true,
      cancelledAt: true,
      financialStatus: true,
      lineItems: {
        select: {
          quantity: true,
          productItem: { select: { id: true, sku: true } },
        },
      },
      approvalRequests: {
        where: { type: ORDER_PAYMENT_APPROVAL },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const duplicateNotice = isErpKokoOrder(order)
    ? await loadDuplicateNotice(order)
    : [];

  return NextResponse.json({
    kokoLinkGeneratedAt: order.kokoLinkGeneratedAt?.toISOString() ?? null,
    kokoLinkTimeConfirmedAt: order.kokoLinkTimeConfirmedAt?.toISOString() ?? null,
    needsConfirm: canEditKokoLinkTime({
      ...order,
      paymentApprovalStatus: order.approvalRequests[0]?.status ?? null,
    }) && order.kokoLinkTimeConfirmedAt == null,
    duplicateNotice,
  });
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requirePermission("fulfillment.sample_free_issue.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context?.user?.companyId;
  const userId = auth.context?.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company" }, { status: 404 });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const body = kokoLinkTimeConfirmBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body", details: body.error.flatten() }, { status: 400 });
  }

  const linkAt = parseKokoLinkGeneratedAt(body.data.kokoLinkGeneratedAt);
  if (!linkAt) {
    return NextResponse.json({ error: "Invalid KOKO link generated time" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idParsed.data, companyId },
    select: {
      id: true,
      companyId: true,
      companyLocationId: true,
      sourceName: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      customerPhone: true,
      createdAt: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      totalPrice: true,
      kokoLinkGeneratedAt: true,
      kokoLinkTimeConfirmedAt: true,
      cancelledAt: true,
      financialStatus: true,
      lineItems: {
        select: {
          quantity: true,
          productItem: { select: { id: true, sku: true, productTitle: true } },
        },
      },
      approvalRequests: {
        where: { type: ORDER_PAYMENT_APPROVAL },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!isErpKokoOrder(order)) {
    return NextResponse.json({ error: "Only ERP KOKO orders require link generated time" }, { status: 400 });
  }
  if (!canEditKokoLinkTime({
    ...order,
    paymentApprovalStatus: order.approvalRequests[0]?.status ?? null,
  })) {
    return NextResponse.json(
      { error: "KOKO link time cannot be changed after finance approval" },
      { status: 409 },
    );
  }

  const now = new Date();
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      kokoLinkGeneratedAt: linkAt,
      kokoLinkTimeConfirmedAt: now,
      kokoLinkTimeConfirmedById: userId,
    },
    select: {
      id: true,
      kokoLinkGeneratedAt: true,
      kokoLinkTimeConfirmedAt: true,
    },
  });

  const existingStatus = order.approvalRequests[0]?.status;
  if (existingStatus !== "pending" && existingStatus !== "approved") {
    await createOrGetOrderPaymentApproval({
      companyId,
      orderId: order.id,
      requestedById: userId,
      invoiceLabel: order.name ?? order.orderNumber ?? order.shopifyOrderId ?? order.id,
      paymentType: order.paymentGatewayPrimary ?? "Koko",
      amount: order.totalPrice.toString(),
      companyLocationId: order.companyLocationId,
    });
  }

  await writeAuditLog({
    companyId,
    actorUserId: userId,
    module: "orders",
    action: "fulfillment_updated",
    entityType: "Order",
    entityId: order.id,
    summary: `Confirmed KOKO link generated time for ${order.name ?? order.orderNumber ?? order.id}`,
    afterData: {
      kokoLinkGeneratedAt: linkAt.toISOString(),
      kokoLinkTimeConfirmedAt: now.toISOString(),
    },
  });

  const duplicateNotice = await loadDuplicateNotice({
    id: order.id,
    companyId: order.companyId,
    customerPhone: order.customerPhone,
    createdAt: order.createdAt,
    lineItems: order.lineItems,
  });

  return NextResponse.json({
    success: true,
    kokoLinkGeneratedAt: updated.kokoLinkGeneratedAt?.toISOString() ?? null,
    kokoLinkTimeConfirmedAt: updated.kokoLinkTimeConfirmedAt?.toISOString() ?? null,
    duplicateNotice,
  });
}
