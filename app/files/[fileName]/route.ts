import { NextRequest, NextResponse } from "next/server";

import { storedFileResponse } from "@/lib/file-storage-response";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await params;
  const decodedFileName = decodeURIComponent(fileName).trim();
  if (!decodedFileName) return NextResponse.json({ error: "File name is required" }, { status: 400 });

  const file = await prisma.file.findFirst({
    where: { fileName: decodedFileName },
    orderBy: { createdAt: "desc" },
    select: { blobUrl: true, mimeType: true, fileName: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  return storedFileResponse({
    url: file.blobUrl,
    request,
    mimeType: file.mimeType,
    fileName: file.fileName,
    cacheControl: "public, max-age=3600",
  });
}
