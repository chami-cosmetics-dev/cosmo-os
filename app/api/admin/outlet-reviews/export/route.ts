import { NextRequest, NextResponse } from "next/server";

import { fetchOutletReviewSheetData } from "@/lib/page-data/outlet-review-sheet";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

function escapeCsv(value: string | null | undefined): string {
  const str = value ?? "";
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-LK", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["outlets.read.all", "outlets.read.assigned"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  const viewerUserId = auth.context.user?.id ?? null;
  if (!companyId || !viewerUserId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const canReadAll = hasPermission(auth.context, "outlets.read.all");
  const { searchParams } = request.nextUrl;
  const outletId = searchParams.get("outletId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const data = await fetchOutletReviewSheetData({
    companyId,
    viewerUserId,
    canReadAll,
    outletId,
    startDate,
    endDate,
  });

  const HEADERS = ["Outlet", "Date", "Merchant", "Customer", "Order No", "Products", "Mobile", "Review Requested", "Review Collected"];
  const rows: string[] = [];

  const isAllOutlets = !outletId || outletId === "__all";

  if (isAllOutlets && canReadAll) {
    // Group by outlet with section headers
    const grouped = new Map<string, (typeof data.reviews)>();
    for (const review of data.reviews) {
      const key = review.outletId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(review);
    }

    for (const [, outletReviews] of grouped) {
      if (outletReviews.length === 0) continue;
      rows.push(`\n=== ${escapeCsv(outletReviews[0].outletName)} ===`);
      rows.push(HEADERS.map(escapeCsv).join(","));
      for (const r of outletReviews) {
        rows.push([
          escapeCsv(r.outletName),
          escapeCsv(formatDate(r.orderCreatedAt)),
          escapeCsv(r.merchantName),
          escapeCsv(r.customerName),
          escapeCsv(r.erpnextInvoiceId ?? r.orderLabel),
          escapeCsv(r.productNames.join("; ")),
          escapeCsv(r.customerPhone),
          escapeCsv(r.reviewRequested),
          escapeCsv(r.reviewCollected),
        ].join(","));
      }
    }
  } else {
    rows.push(HEADERS.map(escapeCsv).join(","));
    for (const r of data.reviews) {
      rows.push([
        escapeCsv(r.outletName),
        escapeCsv(formatDate(r.orderCreatedAt)),
        escapeCsv(r.merchantName),
        escapeCsv(r.customerName),
        escapeCsv(r.erpnextInvoiceId ?? r.orderLabel),
        escapeCsv(r.productNames.join("; ")),
        escapeCsv(r.customerPhone),
        escapeCsv(r.reviewRequested),
        escapeCsv(r.reviewCollected),
      ].join(","));
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const outletLabel = outletId && outletId !== "__all"
    ? (data.outlets.find((o) => o.id === outletId)?.name ?? "outlet").replace(/\s+/g, "-").toLowerCase()
    : "all";
  const filename = `outlet-reviews-${outletLabel}-${today}.csv`;

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
