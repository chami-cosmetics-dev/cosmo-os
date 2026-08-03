import { NextRequest, NextResponse } from "next/server";

import { resolveInvoicePrintMode } from "@/lib/invoice-print-mode";
import { prisma } from "@/lib/prisma";
import { renderOrderInvoice } from "@/lib/render-order-invoice";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { shouldIncrementPrint, autoPrint } = resolveInvoicePrintMode(
    request.nextUrl.searchParams
  );
  const auth = await requireAnyPermission(
    shouldIncrementPrint
      ? ["fulfillment.order_print.print"]
      : ["fulfillment.order_print.read"]
  );
  if (!auth.ok) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return new NextResponse("No company", { status: 404 });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return new NextResponse("Invalid ID", { status: 400 });
  }

  const result = await renderOrderInvoice({
    orderId: idResult.data,
    companyId,
    userId: auth.context!.user!.id,
    shouldIncrementPrint,
    autoPrint,
  });

  if (!result.ok) {
    return new NextResponse(result.message, { status: result.status });
  }

  return new NextResponse(result.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
