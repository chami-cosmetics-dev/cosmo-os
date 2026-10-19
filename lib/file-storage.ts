import { randomUUID } from "node:crypto";

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

/**
 * Cosmo OS file storage. Every new file lives on Cloudinary as an
 * "authenticated" asset, so it is only reachable through a signed URL.
 *
 * Rows keep the plain secure_url Cloudinary returns; the URL itself carries the
 * cloud, resource type, delivery type and public id, so signing, reading and
 * deleting need no extra columns. Legacy Vercel Blob URLs are still readable
 * (and deletable) until scripts/migrate-blob-to-cloudinary.ts has moved them.
 */

export const STORAGE_ROOT = "cosmo-os/storage";

export type CloudinaryResourceType = "image" | "video" | "raw";

export type StoredFile = {
  url: string;
  publicId: string;
  resourceType: CloudinaryResourceType;
  sizeBytes: number;
  /** Seconds, rounded — set for video and audio only. */
  durationSeconds: number | null;
};

type CloudinaryFileRef = {
  cloudName: string;
  resourceType: CloudinaryResourceType;
  deliveryType: string;
  version: string | null;
  publicId: string;
  format: string | null;
};

const RESOURCE_TYPES = new Set<string>(["image", "video", "raw"]);

/**
 * Per-file limits of the current Cloudinary plan (Free: 10 MB image/raw,
 * 100 MB video). Raise these when the plan is upgraded; check with
 * `cloudinary.api.usage()` → media_limits.
 */
const MAX_BYTES: Record<CloudinaryResourceType, number> = {
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  raw: 10 * 1024 * 1024,
};

/** Null when the file fits, otherwise a message for the user. */
export function storageSizeError(mimeType: string | null | undefined, sizeBytes: number) {
  const max = MAX_BYTES[resourceTypeForMime(mimeType)];
  if (sizeBytes <= max) return null;
  return `File too large. Maximum size for this file type is ${Math.round(max / (1024 * 1024))}MB`;
}

/**
 * Images Cloudinary can serve back untouched go in as "image"; video and audio
 * both use "video" (that is how Cloudinary files audio). PSD and SVG stay "raw"
 * so the original bytes come back exactly as uploaded.
 */
export function resourceTypeForMime(mimeType: string | null | undefined): CloudinaryResourceType {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/") && mime !== "image/vnd.adobe.photoshop" && mime !== "image/svg+xml") {
    return "image";
  }
  if (mime.startsWith("video/") || mime.startsWith("audio/")) return "video";
  return "raw";
}

function safeSegment(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned || "file";
}

/** Folder under the storage root, e.g. storageFolder(companyId, "files"). */
export function storageFolder(...segments: string[]) {
  return [STORAGE_ROOT, ...segments.map(safeSegment)].join("/");
}

function buildPublicId(folder: string, fileName: string, resourceType: CloudinaryResourceType) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const id = `${folder}/${safeSegment(base)}-${randomUUID().slice(0, 8)}`;
  // Raw public ids keep their extension; image/video ids must not have one.
  return resourceType === "raw" && ext ? `${id}.${ext}` : id;
}

function requireCloudinaryConfig() {
  const cfg = cloudinary.config();
  if (!cfg.cloud_name || !cfg.api_key || !cfg.api_secret) {
    throw new Error("Cloudinary is not configured (CLOUDINARY_URL missing)");
  }
  return { cloudName: cfg.cloud_name, apiKey: cfg.api_key, apiSecret: cfg.api_secret };
}

export function parseCloudinaryUrl(url: string): CloudinaryFileRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "res.cloudinary.com") return null;

  const [cloudName, resourceType, deliveryType, ...rest] = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (!cloudName || !RESOURCE_TYPES.has(resourceType) || !deliveryType) return null;

  let i = 0;
  if (rest[i]?.startsWith("s--") && rest[i].endsWith("--")) i += 1;
  let version: string | null = null;
  if (/^v\d+$/.test(rest[i] ?? "")) {
    version = rest[i].slice(1);
    i += 1;
  }
  const path = rest.slice(i).join("/");
  if (!path) return null;

  const base = { cloudName, resourceType: resourceType as CloudinaryResourceType, deliveryType, version };
  if (resourceType === "raw") return { ...base, publicId: path, format: null };

  const dot = path.lastIndexOf(".");
  if (dot > path.lastIndexOf("/")) {
    return { ...base, publicId: path.slice(0, dot), format: path.slice(dot + 1) };
  }
  return { ...base, publicId: path, format: null };
}

export function isLegacyBlobUrl(url: string) {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** True when the URL is one of our Cloudinary files inside `folder`. */
export function isStoredFileInFolder(url: string, folder: string) {
  const ref = parseCloudinaryUrl(url);
  if (!ref) return false;
  return ref.cloudName === cloudinary.config().cloud_name && ref.publicId.startsWith(`${folder}/`);
}

/**
 * A URL the browser or server can fetch. Authenticated assets get a signed URL;
 * public Cloudinary URLs come back as-is. Null for non-Cloudinary URLs.
 */
export function cloudinaryDeliveryUrl(url: string): string | null {
  const ref = parseCloudinaryUrl(url);
  if (!ref) return null;
  if (ref.deliveryType === "upload") return url;
  return cloudinary.url(ref.publicId, {
    resource_type: ref.resourceType,
    type: ref.deliveryType,
    ...(ref.version ? { version: ref.version } : {}),
    ...(ref.format ? { format: ref.format } : {}),
    sign_url: true,
    secure: true,
  });
}

/** Fetch a stored file (Cloudinary or legacy Vercel Blob). */
export async function fetchStoredFile(url: string, init?: { range?: string | null }) {
  const headers: Record<string, string> = {};
  if (init?.range) headers.Range = init.range;

  const delivery = cloudinaryDeliveryUrl(url);
  if (delivery) return fetch(delivery, { headers });

  // The Blob token is only ever sent to Blob itself.
  if (isLegacyBlobUrl(url) && process.env.BLOB_READ_WRITE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
  }
  return fetch(url, { headers });
}

export async function fetchStoredFileBytes(url: string): Promise<Buffer> {
  const res = await fetchStoredFile(url);
  if (!res.ok) throw new Error(`Failed to read stored file (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function toStoredFile(result: UploadApiResponse, resourceType: CloudinaryResourceType): StoredFile {
  const duration = typeof result.duration === "number" ? Math.round(result.duration) : null;
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType,
    sizeBytes: result.bytes,
    durationSeconds: resourceType === "video" ? duration : null,
  };
}

/** Server-side upload for small files (receipts, settings files, waybill PDFs). */
export async function uploadStoredFile(input: {
  folder: string;
  fileName: string;
  mimeType: string | null;
  bytes: Buffer;
}): Promise<StoredFile> {
  requireCloudinaryConfig();
  const resourceType = resourceTypeForMime(input.mimeType);
  const publicId = buildPublicId(input.folder, input.fileName, resourceType);

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: resourceType, type: "authenticated", overwrite: false },
      (err, res) => (err || !res ? reject(err ?? new Error("Cloudinary upload failed")) : resolve(res)),
    );
    stream.end(input.bytes);
  });
  return toStoredFile(result, resourceType);
}

/**
 * Signed parameters for a browser-direct upload, so large videos never pass
 * through a serverless function. The public id is fixed by the signature: the
 * browser can only write to the folder the server chose.
 */
export function signDirectUpload(input: { folder: string; fileName: string; mimeType: string | null }) {
  const { cloudName, apiKey, apiSecret } = requireCloudinaryConfig();
  const resourceType = resourceTypeForMime(input.mimeType);
  const publicId = buildPublicId(input.folder, input.fileName, resourceType);
  const timestamp = Math.round(Date.now() / 1000);
  const signed = { public_id: publicId, timestamp, type: "authenticated" };
  const signature = cloudinary.utils.api_sign_request(signed, apiSecret);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    fields: {
      api_key: apiKey,
      public_id: publicId,
      timestamp: String(timestamp),
      type: "authenticated",
      signature,
    },
  };
}

/**
 * Remove a stored file. Cloudinary "not found" counts as success so a retry
 * after a partial failure does not error.
 */
export async function deleteStoredFile(url: string) {
  const ref = parseCloudinaryUrl(url);
  if (ref) {
    const res = (await cloudinary.uploader.destroy(ref.publicId, {
      resource_type: ref.resourceType,
      type: ref.deliveryType,
      invalidate: true,
    })) as { result?: string };
    if (res.result !== "ok" && res.result !== "not found") {
      throw new Error(`Cloudinary delete failed for ${ref.publicId}: ${res.result ?? "unknown"}`);
    }
    return;
  }
  if (isLegacyBlobUrl(url)) {
    const { del } = await import("@vercel/blob");
    await del(url);
  }
}

/** Best-effort delete: logs instead of throwing. DB rows are the source of truth. */
export async function deleteStoredFileQuietly(url: string, context: string) {
  try {
    await deleteStoredFile(url);
  } catch (err) {
    console.error(`[file-storage] ${context}: delete failed`, err);
  }
}
