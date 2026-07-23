import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { deleteWaybillUpload } from "@/lib/order-waybills";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidOrUuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(["fulfillment.waybill_lookup.import"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id: rawId } = await params;
  const idParsed = cuidOrUuidSchema.safeParse(rawId);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid upload id." }, { status: 400 });
  }

  const result = await deleteWaybillUpload({
    companyId,
    uploadId: idParsed.data,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "orders",
    action: "fulfillment_updated",
    entityType: "WaybillUpload",
    entityId: idParsed.data,
    summary: `Deleted waybill upload ${result.fileName}`,
    metadata: {
      fileName: result.fileName,
      deletedWaybills: result.deletedWaybills,
    },
  });

  return NextResponse.json({
    message: "Upload deleted.",
    fileName: result.fileName,
    deletedWaybills: result.deletedWaybills,
  });
}
