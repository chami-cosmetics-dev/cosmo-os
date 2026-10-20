import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { applyGiftVouchersToOrder, getOrderGiftVoucherState } from "@/lib/gift-vouchers/order";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, trimmedString } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  codes: z.array(trimmedString(1, 60)).min(1).max(100),
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
    // Applying is open to everyone who can view orders; usage is still audit-logged per user.
    canApply: true,
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

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter between 1 and 100 batch codes" }, { status: 400 });
  }

  const result = await applyGiftVouchersToOrder({
    companyId,
    orderId: idParsed.data,
    actorUserId: auth.context.user?.id ?? null,
    codes: parsed.data.codes,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ applied: result.data });
}
