import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { storedFileResponse } from "@/lib/file-storage-response";
import { deleteStorageFileEverywhere, findStorageFile } from "@/lib/product-item-storage";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("products.storage.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id } = await params;
  const file = await findStorageFile(companyId, id);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Product media is meant for marketing use; a signed URL lets video and
  // audio stream with seeking straight from Cloudinary.
  return storedFileResponse({
    url: file.url,
    request,
    mimeType: file.mimeType,
    cacheControl: "private, max-age=3600",
    redirect: true,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("products.storage.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  const userId = auth.context!.user!.id;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id } = await params;
  const file = await findStorageFile(companyId, id);
  if (!file) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const removed = await deleteStorageFileEverywhere(companyId, file.url);

  await writeAuditLog({
    companyId,
    actorUserId: userId,
    module: "products",
    action: "storage_file_deleted",
    entityType: "ProductItemAsset",
    entityId: id,
    summary: `Deleted ${file.fileName} (${file.type})${file.sku ? ` for SKU ${file.sku}` : ""}`,
    metadata: { fileName: file.fileName, type: file.type, sku: file.sku, ...removed },
  });

  return NextResponse.json({ ok: true });
}
