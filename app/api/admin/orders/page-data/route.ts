import { NextRequest, NextResponse } from "next/server";

import { createPerfLogger } from "@/lib/perf";
import { fetchOrdersPageData } from "@/lib/page-data/orders";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import {
  limitSchema,
  optionalIsoDateTimeQuerySchema,
  orderPaymentGatewayFilterSchema,
  orderStatusFilterSchema,
  pageSchema,
  sortOrderSchema,
} from "@/lib/validation";

export async function GET(request: NextRequest) {
  const perf = createPerfLogger("api.admin.orders.page-data.GET", {
    path: request.nextUrl.pathname,
  });
  const auth = await requireAnyPermission([
    "orders.read",
    "orders.cancel",
    "fulfillment.sample_free_issue.read",
    "fulfillment.order_print.read",
    "fulfillment.ready_dispatch.read",
    "fulfillment.delivery_invoice.read",
    "fulfillment.invoice_complete.read",
    "fulfillment.delivery_invoice.mark_complete",
    "fulfillment.falcon_upload.read",
  ]);
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
  const companyId = user?.companyId ?? null;
  perf.mark("load-company");
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
  const lastPrintedFromResult = optionalIsoDateTimeQuerySchema.safeParse(
    searchParams.get("last_printed_from") ?? undefined
  );
  const lastPrintedToResult = optionalIsoDateTimeQuerySchema.safeParse(
    searchParams.get("last_printed_to") ?? undefined
  );
  const paymentGatewayResult = orderPaymentGatewayFilterSchema.safeParse(
    searchParams.get("payment_gateway") ?? undefined
  );
  const orderStatusResult = orderStatusFilterSchema.safeParse(
    searchParams.get("order_status") ?? undefined
  );
  const sampleSendLaterParam = searchParams.get("sample_send_later");
  const sampleSendLater =
    sampleSendLaterParam === "future" || sampleSendLaterParam === "all"
      ? sampleSendLaterParam
      : sampleSendLaterParam === "available"
        ? "available"
        : undefined;
  const returnFilterParam = searchParams.get("return_filter");
  const returnFilter =
    returnFilterParam === "normal" || returnFilterParam === "rearrange"
      ? returnFilterParam
      : undefined;

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
    dispatchMode: searchParams.get("dispatch_mode") === "true",
    deliveryMode: searchParams.get("delivery_mode") === "true",
    invoiceCompleteMode: searchParams.get("invoice_complete_mode") === "true",
    printMode: searchParams.get("print_mode") === "true",
    unprintedOnly: searchParams.get("unprinted_only") === "true",
    createdFrom: createdFromResult.success ? createdFromResult.data : undefined,
    createdTo: createdToResult.success ? createdToResult.data : undefined,
    printHistoryMode: searchParams.get("print_history_mode") === "true",
    lastPrintedFrom: lastPrintedFromResult.success ? lastPrintedFromResult.data : undefined,
    lastPrintedTo: lastPrintedToResult.success ? lastPrintedToResult.data : undefined,
    paymentGateway: paymentGatewayResult.success ? paymentGatewayResult.data : undefined,
    orderStatusFilter: orderStatusResult.success ? orderStatusResult.data : undefined,
    sampleSendLater,
    returnFilter,
    merCode: searchParams.get("mer_code")?.trim() || undefined,
  });
  perf.mark("query");

  perf.end({ status: 200, ok: true, page: data.page, limit: data.limit, total: data.total });
  return NextResponse.json(data);
}
