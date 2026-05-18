import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
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

  const blobRes = await fetch(media.url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });

  if (!blobRes.ok || !blobRes.body) {
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 502 });
  }

  return new NextResponse(blobRes.body, {
    headers: {
      "Content-Type": media.mimeType ?? blobRes.headers.get("Content-Type") ?? "audio/webm",
      "Cache-Control": "private, max-age=3600",
      ...(blobRes.headers.get("Content-Length")
        ? { "Content-Length": blobRes.headers.get("Content-Length")! }
        : {}),
    },
  });
}
