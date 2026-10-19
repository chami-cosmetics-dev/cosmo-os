import { NextRequest, NextResponse } from "next/server";

import {
  abortDirectUpload,
  completeDirectUpload,
  isStoredFileInFolder,
  startDirectUpload,
  storageSizeError,
} from "@/lib/file-storage";
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

type UploadBody =
  | { action: "start"; fileName?: string; mimeType?: string | null; fileSize?: number }
  | { action: "complete"; url?: string; uploadId?: string; parts?: Array<{ partNumber: number; etag: string }> }
  | { action: "abort"; url?: string; uploadId?: string };

/**
 * Multipart upload straight from the browser to R2:
 *   start    → signed PUT URL per 10 MB part
 *   complete → R2 assembles the parts; the client then saves the row via
 *              POST /api/admin/product-items/assets
 *   abort    → drop the parts of a cancelled upload
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

  const body = (await request.json().catch(() => null)) as UploadBody | null;
  const folder = productItemStorageFolder(companyId);

  try {
    if (body?.action === "start") {
      const mimeType = body.mimeType || "application/octet-stream";
      if (!body.fileName || typeof body.fileSize !== "number" || body.fileSize <= 0) {
        return NextResponse.json({ error: "fileName and fileSize are required" }, { status: 400 });
      }
      if (!ALLOWED_CONTENT_TYPES.includes(mimeType)) {
        return NextResponse.json({ error: "File type is not allowed" }, { status: 400 });
      }
      const sizeError = storageSizeError(body.fileSize);
      if (sizeError) {
        return NextResponse.json({ error: sizeError }, { status: 400 });
      }
      return NextResponse.json(
        await startDirectUpload({ folder, fileName: body.fileName, mimeType, fileSize: body.fileSize }),
      );
    }

    // complete / abort: only uploads into this company's folder can be touched.
    if (!body?.url || !body.uploadId || !isStoredFileInFolder(body.url, folder)) {
      return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
    }

    if (body.action === "complete") {
      if (!Array.isArray(body.parts) || body.parts.length === 0) {
        return NextResponse.json({ error: "parts are required" }, { status: 400 });
      }
      return NextResponse.json(
        await completeDirectUpload({ url: body.url, uploadId: body.uploadId, parts: body.parts }),
      );
    }
    if (body.action === "abort") {
      await abortDirectUpload({ url: body.url, uploadId: body.uploadId });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[product-items/assets/upload]", body?.action, err);
    return NextResponse.json({ error: "File storage error" }, { status: 500 });
  }
}
