import { NextRequest, NextResponse } from "next/server";

import { updateGiftVoucherGroup } from "@/lib/gift-vouchers/service";
import { GIFT_VOUCHER_MANAGE_PERMISSION } from "@/lib/gift-vouchers/types";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { giftVoucherGroupUpdateSchema } from "@/lib/validation/gift-vouchers";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission(GIFT_VOUCHER_MANAGE_PERMISSION);
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
    return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = giftVoucherGroupUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input" },
      { status: 400 },
    );
  }

  const result = await updateGiftVoucherGroup({
    companyId,
    actorUserId: auth.context.user?.id ?? null,
    groupId: idParsed.data,
    ...parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ group: result.data });
}
