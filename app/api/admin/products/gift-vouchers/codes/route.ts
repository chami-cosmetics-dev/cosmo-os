import { NextRequest, NextResponse } from "next/server";

import { listGiftVoucherCodes } from "@/lib/gift-vouchers/service";
import {
  GIFT_VOUCHER_MANAGE_PERMISSION,
  GIFT_VOUCHER_READ_PERMISSION,
} from "@/lib/gift-vouchers/types";
import { requireAnyPermission } from "@/lib/rbac";
import { giftVoucherCodeListQuerySchema } from "@/lib/validation/gift-vouchers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([GIFT_VOUCHER_READ_PERMISSION, GIFT_VOUCHER_MANAGE_PERMISSION]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const params = Object.fromEntries(
    [...request.nextUrl.searchParams.entries()].filter(([, value]) => value.trim() !== ""),
  );
  const parsed = giftVoucherCodeListQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid filters", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await listGiftVoucherCodes({ companyId, ...parsed.data });

  return NextResponse.json(result);
}
