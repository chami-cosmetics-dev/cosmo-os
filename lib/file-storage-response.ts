import { NextResponse } from "next/server";

import { fetchStoredFile, storedFileDeliveryUrl } from "@/lib/file-storage";

/**
 * Serve a stored file from an API route.
 *
 * `redirect: true` hands the browser a short-lived signed URL (needed for
 * large video, audio and PSD files: native range requests, no function
 * bandwidth or size limits). Leave it off for sensitive small files
 * (receipts, company files) so no URL leaves the server; those are streamed
 * through with Range passed along.
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
    const delivery = await storedFileDeliveryUrl(input.url, {
      fileName: input.fileName,
      mimeType: input.mimeType,
    });
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
