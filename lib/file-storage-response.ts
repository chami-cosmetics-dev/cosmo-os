import { NextResponse } from "next/server";

import { cloudinaryDeliveryUrl, fetchStoredFile } from "@/lib/file-storage";

/**
 * Serve a stored file from an API route.
 *
 * `redirect: true` hands the browser a signed Cloudinary URL (best for video
 * and audio: native range requests, no function bandwidth). Leave it off for
 * sensitive files (receipts, company files) so the signed URL never leaves
 * the server; those are streamed through with Range passed along.
 */
export async function storedFileResponse(input: {
  url: string;
  request: Request;
  mimeType?: string | null;
  fileName?: string | null;
  cacheControl: string;
  redirect?: boolean;
}) {
  if (input.redirect) {
    const delivery = cloudinaryDeliveryUrl(input.url);
    if (delivery) return NextResponse.redirect(delivery, 302);
  }

  const upstream = await fetchStoredFile(input.url, { range: input.request.headers.get("range") });
  if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });
  }

  const headers: Record<string, string> = {
    "Content-Type":
      input.mimeType ?? upstream.headers.get("Content-Type") ?? "application/octet-stream",
    "Cache-Control": input.cacheControl,
  };
  if (input.fileName) {
    headers["Content-Disposition"] = `inline; filename="${input.fileName.replace(/"/g, "")}"`;
  }
  for (const name of ["Content-Length", "Content-Range", "Accept-Ranges"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
