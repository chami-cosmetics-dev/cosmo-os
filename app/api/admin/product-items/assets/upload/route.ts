import { NextRequest, NextResponse } from "next/server";

import { signDirectUpload, storageSizeError } from "@/lib/file-storage";
import { productItemStorageFolder } from "@/lib/product-item-storage";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const ALLOWED_CONTENT_TYPES = [
  // images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // video
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // audio
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
  // documents / design files
  "image/vnd.adobe.photoshop",
  "application/octet-stream",
  "application/pdf",
];

/**
 * Returns signed Cloudinary parameters; the browser uploads the file straight
 * to Cloudinary, then saves the result via POST /api/admin/product-items/assets.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission("products.storage.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  } | null;

  const mimeType = body?.mimeType || "application/octet-stream";
  if (!body?.fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }
  if (!ALLOWED_CONTENT_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: "File type is not allowed" }, { status: 400 });
  }
  const sizeError = typeof body.fileSize === "number" ? storageSizeError(mimeType, body.fileSize) : null;
  if (sizeError) {
    return NextResponse.json({ error: sizeError }, { status: 400 });
  }

  try {
    const signed = signDirectUpload({
      folder: productItemStorageFolder(companyId),
      fileName: body.fileName,
      mimeType,
    });
    return NextResponse.json(signed);
  } catch (err) {
    console.error("[product-items/assets/upload] sign failed", err);
    return NextResponse.json({ error: "File storage is not configured" }, { status: 500 });
  }
}
