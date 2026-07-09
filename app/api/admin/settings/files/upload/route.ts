import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/css",
  "application/json",
  "application/octet-stream",
];

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = auth.context!.user!.id;
  const companyId = auth.context!.user!.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  if (!ALLOWED_CONTENT_TYPES.includes(file.type || "application/octet-stream")) {
    return NextResponse.json({ error: "File type is not allowed" }, { status: 400 });
  }

  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large. Maximum size is 25MB" }, { status: 400 });
  }

  const blob = await put(file.name, file, {
    access: "private",
    addRandomSuffix: true,
  });

  const saved = await prisma.file.create({
    data: {
      companyId,
      fileName: file.name,
      blobUrl: blob.url,
      fileSize: file.size,
      mimeType: file.type || null,
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
    entityId: saved.id,
    summary: `Uploaded file ${saved.fileName}`,
  });

  return NextResponse.json({
    ...saved,
    url: `/api/admin/settings/files/${saved.id}`,
    createdAt: saved.createdAt.toISOString(),
  });
}
