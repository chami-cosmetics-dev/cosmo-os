import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { NEW_ITEM_REQUESTS_PERMISSIONS } from "@/lib/new-item-requests/permissions";
import { listCompanyRequests, NewItemRequestError } from "@/lib/new-item-requests/store";
import { requirePermission } from "@/lib/rbac";
import { newItemRequestListQueryFromSearch } from "@/lib/validation/new-item-requests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requirePermission(NEW_ITEM_REQUESTS_PERMISSIONS.admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = newItemRequestListQueryFromSearch(request.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const requests = await listCompanyRequests(auth.context!, parsed.data, 5_000);
    const sheetRows = requests.map((row) => ({
      "Created at": row.createdAt,
      Creator: row.createdByName ?? "",
      Brand: row.brandName,
      "Existing or new": row.brandIsExisting ? "existing" : "new",
      Priority: row.priority ?? "",
      Product: row.productName,
      Description: row.description,
      Link: row.storeUrl ?? "",
      "Image URL": row.imageUrl ?? "",
      "Customer name": row.customerName ?? "",
      "Customer phone": row.customerPhone ?? "",
      Votes: row.voteCount,
      Voters: row.voterNames.join(", "),
      "Vote details": row.votes
        .map((vote) =>
          [vote.userName, vote.customerName, vote.customerPhone, vote.customerEmail].filter(Boolean).join(" · "),
        )
        .join("; "),
      Status: row.status,
      "Status changed at": row.statusChangedAt ?? "",
      "Status changed by": row.statusChangedByName ?? "",
    }));
    const workbook = XLSX.utils.book_new();
    const sheet =
      sheetRows.length > 0
        ? XLSX.utils.json_to_sheet(sheetRows)
        : XLSX.utils.aoa_to_sheet([
            [
              "Created at",
              "Creator",
              "Brand",
              "Existing or new",
              "Priority",
              "Product",
              "Description",
              "Link",
              "Image URL",
              "Customer name",
              "Customer phone",
              "Votes",
              "Voters",
              "Vote details",
              "Status",
              "Status changed at",
              "Status changed by",
            ],
          ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Requests");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const today = new Date().toISOString().slice(0, 10);
    const filename = `new-item-requests-${parsed.data.status}-${today}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof NewItemRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[new-item-requests/export]", error);
    return NextResponse.json({ error: "Could not export requests" }, { status: 500 });
  }
}
