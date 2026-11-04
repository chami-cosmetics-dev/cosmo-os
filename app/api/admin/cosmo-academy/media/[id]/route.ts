import { NextRequest, NextResponse } from "next/server";

import { storedFileResponse } from "@/lib/file-storage-response";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("academy.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 404 });
  }

  const { id } = await params;

  const media = await prisma.cosmoAcademyMedia.findFirst({
    where: { id, explanation: { companyId } },
    select: { url: true, mimeType: true },
  });

  if (!media) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return storedFileResponse({
    url: media.url,
    request,
    mimeType: media.mimeType ?? "audio/webm",
    cacheControl: "private, max-age=3600",
    redirect: true,
  });
}
