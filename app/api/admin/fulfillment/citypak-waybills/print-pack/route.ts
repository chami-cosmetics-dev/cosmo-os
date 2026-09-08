import { NextRequest, NextResponse } from "next/server";

import { parseCitypakWaybillPrintSize } from "@/lib/citypak-api";
import { loadCitypakWaybillPdf, mergeCitypakWaybillPdfs } from "@/lib/citypak-waybill-pdf";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidOrUuidSchema, cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function parseIdList(value: string | null) {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([
    "fulfillment.ready_dispatch.dispatch",
    "fulfillment.ready_dispatch.read",
    "fulfillment.waybill_lookup.read",
    "fulfillment.falcon_upload.read",
  ]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user!.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const printSize = parseCitypakWaybillPrintSize(request.nextUrl.searchParams.get("printSize"));
  // Both layouts use Falcon 4×6 label PDFs; A4 tiles 4 labels per sheet.
  const sourceSize = "4x6" as const;

  // Order ids are CUID; OrderWaybill ids from saveOrderWaybill use randomUUID().
  const orderIds = parseIdList(request.nextUrl.searchParams.get("orderIds")).filter(
    (id) => cuidSchema.safeParse(id).success
  );
  const waybillIds = parseIdList(request.nextUrl.searchParams.get("waybillIds")).filter(
    (id) => cuidOrUuidSchema.safeParse(id).success
  );

  if (orderIds.length === 0 && waybillIds.length === 0) {
    return NextResponse.json({ error: "No waybills selected" }, { status: 400 });
  }

  const parts: Buffer[] = [];
  const errors: string[] = [];

  for (const orderId of orderIds) {
    const loaded = await loadCitypakWaybillPdf({ companyId, orderId, printSize: sourceSize });
    if (loaded.ok) parts.push(loaded.bytes);
    else errors.push(loaded.error);
  }

  for (const waybillId of waybillIds) {
    const owned = await prisma.orderWaybill.findFirst({
      where: { id: waybillId, companyId },
      select: { id: true },
    });
    if (!owned) {
      errors.push("Waybill not found");
      continue;
    }
    const loaded = await loadCitypakWaybillPdf({ companyId, waybillId, printSize: sourceSize });
    if (loaded.ok) parts.push(loaded.bytes);
    else errors.push(loaded.error);
  }

  if (parts.length === 0) {
    return NextResponse.json(
      { error: errors[0] ?? "No CityPak waybill PDFs available" },
      { status: 404 }
    );
  }

  const merged = await mergeCitypakWaybillPdfs(parts, { printSize });
  const filename =
    printSize === "4x6" ? "citypak-waybills-4x6.pdf" : "citypak-waybills-A4.pdf";
  return new NextResponse(new Uint8Array(merged), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
