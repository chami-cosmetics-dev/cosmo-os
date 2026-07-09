import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
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

  const blobRes = await fetch(
    file.blobUrl,
    process.env.BLOB_READ_WRITE_TOKEN
      ? { headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } }
      : undefined,
  );
  if (!blobRes.ok || !blobRes.body) {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });
  }

  return new NextResponse(blobRes.body, {
    headers: {
      "Content-Type": file.mimeType ?? blobRes.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
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
    select: { id: true, fileName: true, blobUrl: true, provider: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  await prisma.file.delete({ where: { id: file.id } });

  if (!file.provider || file.provider === "vercel_blob") {
    try {
      await del(file.blobUrl);
    } catch {
      // Already deleted or unavailable; the DB record is the source of truth for the app.
    }
  }

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
