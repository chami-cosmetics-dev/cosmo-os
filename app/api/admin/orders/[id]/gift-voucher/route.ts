import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { applyGiftVoucherToOrder, getOrderGiftVoucherState } from "@/lib/gift-vouchers/order";
import { GIFT_VOUCHER_MANAGE_PERMISSION } from "@/lib/gift-vouchers/types";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cuidSchema, trimmedString } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  code: trimmedString(1, 60),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const state = await getOrderGiftVoucherState({
    companyId,
    orderId: idParsed.data,
    canApply: hasPermission(auth.context, GIFT_VOUCHER_MANAGE_PERMISSION),
  });
  if (!state) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json(state);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission(GIFT_VOUCHER_MANAGE_PERMISSION);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!hasPermission(auth.context, "orders.read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const companyId = auth.context.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a batch code" }, { status: 400 });
  }

  const result = await applyGiftVoucherToOrder({
    companyId,
    orderId: idParsed.data,
    actorUserId: auth.context.user?.id ?? null,
    code: parsed.data.code,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ applied: result.data });
}
