import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
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

  const asset = await prisma.productItemAsset.findFirst({
    where: { id, companyId },
    select: { blobUrl: true, mimeType: true, provider: true },
  });

  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blobRes = await fetch(asset.blobUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });

  if (!blobRes.ok || !blobRes.body) {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });
  }

  return new NextResponse(blobRes.body, {
    headers: {
      "Content-Type": asset.mimeType ?? blobRes.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      ...(blobRes.headers.get("Content-Length")
        ? { "Content-Length": blobRes.headers.get("Content-Length")! }
        : {}),
    },
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

  const asset = await prisma.productItemAsset.findFirst({
    where: { id, companyId },
    select: { id: true, fileName: true, blobUrl: true, provider: true, sku: true, type: true },
  });

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Delete all rows sharing the same blob URL (uploaded for all family SKUs at once)
  await prisma.productItemAsset.deleteMany({
    where: { companyId, blobUrl: asset.blobUrl },
  });

  // Delete from Vercel Blob (only once, after all DB rows are gone)
  if (!asset.provider || asset.provider === "vercel_blob") {
    try {
      await del(asset.blobUrl);
    } catch {
      // Blob may already be deleted — non-fatal
    }
  }

  await writeAuditLog({
    companyId,
    actorUserId: userId,
    module: "products",
    action: "storage_file_deleted",
    entityType: "ProductItemAsset",
    entityId: asset.id,
    summary: `Deleted ${asset.fileName ?? asset.type} (${asset.type}) for SKU ${asset.sku}`,
    metadata: { fileName: asset.fileName, type: asset.type, sku: asset.sku },
  });

  return NextResponse.json({ ok: true });
}
