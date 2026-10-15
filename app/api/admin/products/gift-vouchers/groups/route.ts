import { NextRequest, NextResponse } from "next/server";

import { createGiftVoucherGroup, listGiftVoucherGroups } from "@/lib/gift-vouchers/service";
import {
  GIFT_VOUCHER_MANAGE_PERMISSION,
  GIFT_VOUCHER_READ_PERMISSION,
} from "@/lib/gift-vouchers/types";
import { requireAnyPermission, requirePermission } from "@/lib/rbac";
import { giftVoucherGroupCreateSchema } from "@/lib/validation/gift-vouchers";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAnyPermission([GIFT_VOUCHER_READ_PERMISSION, GIFT_VOUCHER_MANAGE_PERMISSION]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const groups = await listGiftVoucherGroups(companyId);
  return NextResponse.json({ groups });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(GIFT_VOUCHER_MANAGE_PERMISSION);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = giftVoucherGroupCreateSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { mode, quantity, codes, ...group } = parsed.data;
  const result = await createGiftVoucherGroup({
    companyId,
    actorUserId: auth.context.user?.id ?? null,
    ...group,
    ...(mode === "generate" ? { mode, quantity: quantity ?? 0 } : { mode, codes: codes ?? [] }),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
