import { NextRequest, NextResponse } from "next/server";

import { buildCsv, formatIsoDate } from "@/lib/reports/csv";
import { fetchReturnsTrackingData } from "@/lib/page-data/order-returns";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("returns.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";

  const data = await fetchReturnsTrackingData({ companyId });

  let rows = data.returns;
  if (status === "pending" || status === "solved") {
    rows = rows.filter((item) => item.actionStatus === status);
  }
  if (search) {
    rows = rows.filter((item) =>
      [
        item.invoiceNo,
        item.orderName,
        item.orderNumber,
        item.shopifyOrderId,
        item.erpnextInvoiceId,
        item.customerName,
        item.customerEmail,
        item.customerPhone,
        item.merchant,
        item.shippingService,
        item.riderName,
        item.returnRemark,
        item.actionRemark,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(search))
    );
  }

  const csv = buildCsv(
    ["Invoice", "Merchant", "Rider", "Remark", "Date"],
    rows.map((item) => ({
      Invoice: item.invoiceNo,
      Merchant: item.merchant ?? "",
      Rider: item.riderName ?? item.shippingService,
      Remark: item.returnRemark ?? item.actionRemark ?? "",
      Date: formatIsoDate(new Date(item.returnDate)),
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="return-orders.csv"',
    },
  });
}
