import { NextRequest, NextResponse } from "next/server";

import { hasPermission, requireUserContext } from "@/lib/rbac";
import {
  NO_ROP_CHANNEL_COLUMNS,
  parseNoRopChannel,
  readNoRopRows,
} from "@/lib/shop-stock-status/no-rop";
import { buildNoRopWorkbook } from "@/lib/shop-stock-status/no-rop-workbook";

export const dynamic = "force-dynamic";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** NO ROP tab, "Export filtered": the rows the screen shows (sent by the page, so the file matches it). */
export async function POST(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, "store.shop_stock_status.read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const channel = parseNoRopChannel(body?.channel);
  const rows = readNoRopRows(body?.rows, NO_ROP_CHANNEL_COLUMNS[channel]);
  if (!rows) return NextResponse.json({ error: "Invalid rows" }, { status: 400 });
  const filters = typeof body?.filters === "string" ? body.filters.trim().slice(0, 500) : "";
  const fetchedAt = typeof body?.fetchedAt === "string" ? new Date(body.fetchedAt) : null;

  try {
    const { fileName, buffer } = await buildNoRopWorkbook(rows, filters, fetchedAt, channel);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Shop Stock Status NO ROP export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build export" },
      { status: 502 },
    );
  }
}
