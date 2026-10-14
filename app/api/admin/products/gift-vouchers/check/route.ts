import { NextRequest, NextResponse } from "next/server";

import { checkGiftVoucherCode } from "@/lib/gift-vouchers/service";
import {
  GIFT_VOUCHER_MANAGE_PERMISSION,
  GIFT_VOUCHER_READ_PERMISSION,
} from "@/lib/gift-vouchers/types";
import { requireAnyPermission } from "@/lib/rbac";
import { giftVoucherCheckQuerySchema } from "@/lib/validation/gift-vouchers";

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

  const parsed = giftVoucherCheckQuerySchema.safeParse({
    code: request.nextUrl.searchParams.get("code") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a code" }, { status: 400 });
  }

  const result = await checkGiftVoucherCode(companyId, parsed.data.code);
  return NextResponse.json(result);
}
