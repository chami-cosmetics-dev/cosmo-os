import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { deleteStoredFileQuietly } from "@/lib/file-storage";
import { storedFileResponse } from "@/lib/file-storage-response";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });

  const file = await prisma.file.findUnique({
    where: { id: idResult.data },
    select: { blobUrl: true, mimeType: true, fileName: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  return storedFileResponse({
    url: file.blobUrl,
    request,
    mimeType: file.mimeType,
    fileName: file.fileName,
    cacheControl: "private, max-age=3600",
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user!.companyId;
  const userId = auth.context!.user!.id;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });

  const file = await prisma.file.findFirst({
    where: { id: idResult.data, companyId },
    select: { id: true, fileName: true, blobUrl: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  await prisma.file.delete({ where: { id: file.id } });

  await deleteStoredFileQuietly(file.blobUrl, "settings file");

  await writeAuditLog({
    companyId,
    actorUserId: userId,
    module: "settings",
    action: "setting_deleted",
    entityType: "File",
    entityId: file.id,
    summary: `Deleted file ${file.fileName}`,
  });

  return NextResponse.json({ ok: true });
}
