import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function inlineFileName(fileName: string) {
  return fileName.replace(/"/g, "");
}

export async function GET(
  _request: NextRequest,
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
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": `inline; filename="${inlineFileName(file.fileName)}"`,
      ...(blobRes.headers.get("Content-Length")
        ? { "Content-Length": blobRes.headers.get("Content-Length")! }
        : {}),
    },
  });
}
