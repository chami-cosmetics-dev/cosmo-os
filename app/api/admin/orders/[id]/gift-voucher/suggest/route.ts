import { NextRequest, NextResponse } from "next/server";

import { suggestGiftVoucherCodes } from "@/lib/gift-vouchers/order";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, trimmedString } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Anyone who can view orders can apply batch codes, so they get suggestions too.
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
  const queryParsed = trimmedString(1, 60).safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!idParsed.success || !queryParsed.success) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = await suggestGiftVoucherCodes({
    companyId,
    orderId: idParsed.data,
    query: queryParsed.data,
  });
  return NextResponse.json({ suggestions });
}
