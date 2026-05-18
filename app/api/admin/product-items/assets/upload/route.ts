import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

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
  // documents / design files
  "image/vnd.adobe.photoshop",
  "application/octet-stream",
  "application/pdf",
];

export async function POST(request: NextRequest) {
  const auth = await requirePermission("products.storage.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const userId = auth.context!.user!.id;
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = (await request.json()) as HandleUploadBody;

  const jsonResponse = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (_pathname: string, clientPayload: string | null) => {
      const payload = clientPayload ? (JSON.parse(clientPayload) as { sku?: string }) : {};
      return {
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB
        tokenPayload: JSON.stringify({ userId, companyId, sku: payload.sku }),
      };
    },
    onUploadCompleted: async () => {
      // DB record is saved by the client after upload via POST /api/admin/product-items/assets
    },
  });

  return NextResponse.json(jsonResponse);
}
