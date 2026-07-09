import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const fileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  blobUrl: z.string().url().max(2048),
  fileSize: z.number().int().nonnegative().optional().nullable(),
  mimeType: z.string().max(255).optional().nullable(),
});

export async function GET() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user!.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const files = await prisma.file.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      provider: true,
      createdAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    files: files.map((file) => ({
      ...file,
      url: `/api/admin/settings/files/${file.id}`,
      createdAt: file.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user!.companyId;
  const userId = auth.context!.user!.id;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = fileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const file = await prisma.file.create({
    data: {
      companyId,
      fileName: parsed.data.fileName,
      blobUrl: parsed.data.blobUrl,
      fileSize: parsed.data.fileSize ?? null,
      mimeType: parsed.data.mimeType ?? null,
      uploadedById: userId,
    },
    select: { id: true, fileName: true, fileSize: true, mimeType: true, provider: true, createdAt: true },
  });

  await writeAuditLog({
    companyId,
    actorUserId: userId,
    module: "settings",
    action: "setting_created",
    entityType: "File",
    entityId: file.id,
    summary: `Uploaded file ${file.fileName}`,
  });

  return NextResponse.json({
    ...file,
    url: `/api/admin/settings/files/${file.id}`,
    createdAt: file.createdAt.toISOString(),
  });
}
