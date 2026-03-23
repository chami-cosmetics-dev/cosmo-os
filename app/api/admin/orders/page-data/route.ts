import { NextRequest, NextResponse } from "next/server";

import { createPerfLogger } from "@/lib/perf";
import { prisma } from "@/lib/prisma";
import { fetchOrdersPageData } from "@/lib/page-data/orders";
import { requirePermission } from "@/lib/rbac";
import {
  limitSchema,
  optionalIsoDateTimeQuerySchema,
  orderPaymentGatewayFilterSchema,
  pageSchema,
  sortOrderSchema,
} from "@/lib/validation";

export async function GET(request: NextRequest) {
  const perf = createPerfLogger("api.admin.orders.page-data.GET", {
    path: request.nextUrl.pathname,
  });
  const auth = await requirePermission("orders.read");
  perf.mark("auth");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  perf.mark("load-company");

  const companyId = user?.companyId ?? null;
  if (!companyId) {
    perf.end({ status: 404, ok: false });
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const pageResult = pageSchema.safeParse(searchParams.get("page"));
  const limitResult = limitSchema.safeParse(searchParams.get("limit"));
  const sortOrderResult = sortOrderSchema.safeParse(searchParams.get("sort_order"));
  const createdFromResult = optionalIsoDateTimeQuerySchema.safeParse(
    searchParams.get("created_from") ?? undefined
  );
  const createdToResult = optionalIsoDateTimeQuerySchema.safeParse(
    searchParams.get("created_to") ?? undefined
  );
  const paymentGatewayResult = orderPaymentGatewayFilterSchema.safeParse(
    searchParams.get("payment_gateway") ?? undefined
  );

  const data = await fetchOrdersPageData(companyId, {
    page: pageResult.success ? pageResult.data : 1,
    limit: limitResult.success ? limitResult.data : 10,
    sortBy: searchParams.get("sort_by")?.trim() ?? undefined,
    sortOrder: sortOrderResult.success ? sortOrderResult.data : "desc",
    locationId: searchParams.get("location_id") ?? undefined,
    sourceFilter: searchParams.get("source") ?? undefined,
    merchantId: searchParams.get("merchant_id") ?? undefined,
    search: searchParams.get("search")?.trim() ?? undefined,
    fulfillmentStages: searchParams.get("fulfillment_stages")?.trim() ?? undefined,
    createdFrom: createdFromResult.success ? createdFromResult.data : undefined,
    createdTo: createdToResult.success ? createdToResult.data : undefined,
    paymentGateway: paymentGatewayResult.success ? paymentGatewayResult.data : undefined,
  });
  perf.mark("query");

  perf.end({ status: 200, ok: true, page: data.page, limit: data.limit, total: data.total });
  return NextResponse.json(data);
}
