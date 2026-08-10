import { NextRequest, NextResponse } from "next/server";

import { requireStoreAllocationAccess } from "@/lib/store-allocation/auth";
import {
  buildMultiStoreAllocationWorkbookBuffer,
  storeAllocationExportFilename,
  storeAllocationMultiExportFilename,
  type StoreAllocationMultiExportItem,
} from "@/lib/store-allocation/export-plan";
import {
  storeAllocationExportBodySchema,
  storeAllocationMultiExportBodySchema,
} from "@/lib/validation/store-allocation";

export const dynamic = "force-dynamic";

function validateItemSums(
  items: Array<{ sku: string; takeQty: number; locations: Array<{ qty: number }> }>,
): { ok: true } | { ok: false; sku: string; takeQty: number; sum: number } {
  for (const item of items) {
    const sum = item.locations.reduce((s, l) => s + l.qty, 0);
    if (sum !== item.takeQty) {
      return { ok: false, sku: item.sku, takeQty: item.takeQty, sum };
    }
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  const auth = await requireStoreAllocationAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);

  const multi = storeAllocationMultiExportBodySchema.safeParse(body);
  if (multi.success) {
    const check = validateItemSums(multi.data.items);
    if (!check.ok) {
      return NextResponse.json(
        {
          error: "Location quantities must sum to take qty",
          sku: check.sku,
          takeQty: check.takeQty,
          sum: check.sum,
        },
        { status: 400 },
      );
    }
    const items: StoreAllocationMultiExportItem[] = multi.data.items.map((item) => ({
      sku: item.sku,
      description: item.description,
      barcode: item.barcode,
      companyReorderQty: item.companyReorderQty,
      takeQty: item.takeQty,
      locations: item.locations.map((l) => ({
        label: l.label,
        qty: l.qty,
        columnKey: l.columnKey,
      })),
    }));
    const buffer = buildMultiStoreAllocationWorkbookBuffer(items);
    const filename = storeAllocationMultiExportFilename();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const parsed = storeAllocationExportBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sum = parsed.data.locations.reduce((s, l) => s + l.qty, 0);
  if (sum !== parsed.data.takeQty) {
    return NextResponse.json(
      {
        error: "Location quantities must sum to take qty",
        takeQty: parsed.data.takeQty,
        sum,
      },
      { status: 400 },
    );
  }

  const buffer = buildMultiStoreAllocationWorkbookBuffer([
    {
      sku: parsed.data.sku,
      description: parsed.data.description,
      barcode: parsed.data.barcode,
      companyReorderQty: parsed.data.companyReorderQty,
      takeQty: parsed.data.takeQty,
      locations: parsed.data.locations.map((l) => ({ label: l.label, qty: l.qty })),
    },
  ]);
  const filename = storeAllocationExportFilename(parsed.data.sku);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
