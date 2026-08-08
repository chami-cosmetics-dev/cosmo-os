import { NextRequest, NextResponse } from "next/server";

import { requireStoreAllocationAccess } from "@/lib/store-allocation/auth";
import {
  buildStoreAllocationWorkbookBuffer,
  storeAllocationExportFilename,
} from "@/lib/store-allocation/export-plan";
import { storeAllocationExportBodySchema } from "@/lib/validation/store-allocation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireStoreAllocationAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
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

  const buffer = buildStoreAllocationWorkbookBuffer({
    sku: parsed.data.sku,
    description: parsed.data.description,
    barcode: parsed.data.barcode,
    companyReorderQty: parsed.data.companyReorderQty,
    takeQty: parsed.data.takeQty,
    locations: parsed.data.locations.map((l) => ({ label: l.label, qty: l.qty })),
  });
  const filename = storeAllocationExportFilename(parsed.data.sku);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
