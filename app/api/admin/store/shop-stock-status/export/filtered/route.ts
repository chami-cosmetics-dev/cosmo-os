import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";

import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { hasPermission, requireUserContext } from "@/lib/rbac";
import {
  SHOP_STOCK_TAB_COLUMNS,
  SHOP_STOCK_TABS,
  type ShopStockCell,
  type ShopStockRow,
  type ShopStockTab,
} from "@/lib/shop-stock-status/config";
import { addLocationSheet } from "@/lib/shop-stock-status/workbook";
import {
  STOCK_HEALTH_STATUSES,
  type StockHealthStatus,
} from "@/lib/stock-health/config";

export const dynamic = "force-dynamic";

const MAX_ROWS = 20_000;
const SHEET_NAMES: Record<ShopStockTab, string> = {
  shops: "SHOP",
  online: "ONLINE",
};

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The rows as shown on the screen, re-typed (only the fields the sheet uses). */
function readRows(value: unknown, tab: ShopStockTab): ShopStockRow[] | null {
  if (!Array.isArray(value) || value.length > MAX_ROWS) return null;
  const keys = SHOP_STOCK_TAB_COLUMNS[tab].map((c) => c.key);
  const rows: ShopStockRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.commonSku !== "string") return null;
    const sourceCells = (
      r.cells && typeof r.cells === "object" ? r.cells : {}
    ) as Record<string, unknown>;
    const cells: Record<string, ShopStockCell> = {};
    for (const key of keys) {
      const c = (sourceCells[key] ?? {}) as Record<string, unknown>;
      cells[key] = {
        stock: num(c.stock),
        rop: num(c.rop),
        percent:
          typeof c.percent === "number" && Number.isFinite(c.percent)
            ? c.percent
            : null,
      };
    }
    rows.push({
      commonSku: r.commonSku,
      itemName: typeof r.itemName === "string" ? r.itemName : null,
      priority: STOCK_HEALTH_STATUSES.includes(r.priority as StockHealthStatus)
        ? (r.priority as StockHealthStatus)
        : "Blank",
      cells,
      fail: num(r.fail),
      pass: num(r.pass),
    });
  }
  return rows;
}

/**
 * Shop Stock Status, one tab with the filters applied on the screen: the rows the screen
 * shows (sent by the page, so the file matches it) in the same layout as the main export.
 * The main export (SHOP + ONLINE, all Common SKUs) is unchanged.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, "store.shop_stock_status.read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const tab = body?.tab as ShopStockTab;
  if (!SHOP_STOCK_TABS.includes(tab)) {
    return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
  }
  const rows = readRows(body?.rows, tab);
  if (!rows)
    return NextResponse.json({ error: "Invalid rows" }, { status: 400 });
  const filters =
    typeof body?.filters === "string" && body.filters.trim()
      ? body.filters.trim().slice(0, 500)
      : "None";
  const fetchedAt =
    typeof body?.fetchedAt === "string" ? new Date(body.fetchedAt) : null;

  try {
    const downloadedAt = formatAppIsoDateTime(new Date());
    const times = {
      downloadedAt,
      stockAsOf:
        fetchedAt && !Number.isNaN(fetchedAt.getTime())
          ? formatAppIsoDateTime(fetchedAt)
          : "-",
    };

    const wb = new ExcelJS.Workbook();
    addLocationSheet(
      wb,
      SHEET_NAMES[tab],
      rows,
      SHOP_STOCK_TAB_COLUMNS[tab],
      times,
      filters,
    );

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = downloadedAt.slice(0, 16).replace(" ", "_").replace(":", "-");
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="shop-stock-status-${SHEET_NAMES[tab].toLowerCase()}-filtered-${stamp}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Shop Stock Status filtered export failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build export",
      },
      { status: 502 },
    );
  }
}
