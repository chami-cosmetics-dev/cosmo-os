import { NextRequest, NextResponse } from "next/server";

import {
  FOLLOW_UP_STATUS_LABELS,
  getCustomerResponseLabel,
} from "@/lib/abandoned-orders-constants";
import { requirePermission } from "@/lib/rbac";
import { buildCsv, formatIsoDateTime } from "@/lib/reports/csv";
import { fetchAbandonedOrdersPageData } from "@/lib/page-data/abandoned-orders";
import { abandonedOrdersListQuerySchema } from "@/lib/validation";

const MAX_EXPORT_ROWS = 1000;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requirePermission("abandoned_orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;

  const {
    from,
    to,
    status,
    response,
    search,
  } = {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    response: searchParams.get("response") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  };

  // Omit page/limit: list schema cap is 100; export uses MAX_EXPORT_ROWS separately.
  const parsed = abandonedOrdersListQuerySchema.safeParse({
    from,
    to,
    status,
    response,
    search,
  });

  const filters = parsed.success
    ? {
        from: parsed.data.from,
        to: parsed.data.to,
        followUpStatus: parsed.data.status,
        customerResponse: parsed.data.response,
        search: parsed.data.search,
        page: 1,
        limit: MAX_EXPORT_ROWS,
      }
    : {
        from: undefined,
        to: undefined,
        followUpStatus: undefined,
        customerResponse: undefined,
        search: search?.trim() ?? undefined,
        page: 1,
        limit: MAX_EXPORT_ROWS,
      };

  const data = await fetchAbandonedOrdersPageData({ companyId, filters });
  if (data.items.length === 0) {
    return NextResponse.json({ error: "No rows to export" }, { status: 400 });
  }

  const csv = buildCsv(
    [
      "Abandoned Date",
      "Customer Name",
      "Phone",
      "Email",
      "Billing Address",
      "Shipping Address",
      "Cart Summary",
      "Total",
      "Currency",
      "Store",
      "Follow-up Status",
      "Customer Response",
      "Remark",
      "Last Updated By",
      "Last Updated At",
      "Shopify Checkout ID",
    ],
    data.items.map((item) => ({
      "Abandoned Date": formatIsoDateTime(new Date(item.abandonedAt)),
      "Customer Name": item.customerName ?? "",
      Phone: item.customerPhone ?? "",
      Email: item.customerEmail ?? "",
      "Billing Address": item.billingAddressText ?? "",
      "Shipping Address": item.shippingAddressText ?? "",
      "Cart Summary": item.lineItemsSummary ?? "",
      Total: item.totalPrice ?? "",
      Currency: item.currency,
      Store: item.shopifyAdminStoreHandle,
      "Follow-up Status":
        item.followUpStatus
          ? (FOLLOW_UP_STATUS_LABELS[item.followUpStatus] ?? item.followUpStatus)
          : "",
      "Customer Response": item.customerResponse
        ? getCustomerResponseLabel(item.customerResponse)
        : "",
      Remark: item.remark ?? "",
      "Last Updated By": item.lastFollowUpBy?.name ?? "",
      "Last Updated At": item.lastFollowUpAt ? formatIsoDateTime(new Date(item.lastFollowUpAt)) : "",
      "Shopify Checkout ID": item.shopifyCheckoutId,
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="abandoned-orders.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

