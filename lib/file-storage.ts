import { randomUUID } from "node:crypto";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v2 as cloudinary } from "cloudinary";

/**
 * Cosmo OS / Vault OS file storage on Cloudflare R2.
 *
 * Each deployment has its own private bucket and token (FILES_R2_*), so
 * Cosmetics and Vault files never share a bucket. Rows store the location as
 * `r2://<bucket>/<key>`; browsers only ever get short-lived signed URLs.
 *
 * Deleting moves a file under `trash/`; the bucket's lifecycle rule removes it
 * 30 days later (R2 has no object versioning, so this is the undo window).
 *
 * Legacy URLs (Vercel Blob, Cloudinary) stay readable and deletable until
 * scripts/migrate-files-to-r2.ts has moved them. Logos and profile photos stay
 * on Cloudinary and do not go through this module.
 */

/** Rows store `fileSize` as Int, so files must stay under 2^31 bytes. */
export const MAX_FILE_BYTES = 2_000_000_000;

/** Browser uploads go up in parts of this size (R2 minimum is 5 MiB). */
export const UPLOAD_PART_BYTES = 10 * 1024 * 1024;

const SIGNED_URL_SECONDS = 60 * 60;
/** Long enough for a 2 GB upload on a slow office line. */
const UPLOAD_URL_SECONDS = 12 * 60 * 60;
const TRASH_PREFIX = "trash/";

export type StoredFile = {
  url: string;
  key: string;
  sizeBytes: number;
};

type R2Config = { bucket: string; client: S3Client };

let r2Config: R2Config | null = null;

function r2(): R2Config {
  if (r2Config) return r2Config;
  const accountId = process.env.FILES_R2_ACCOUNT_ID;
  const accessKeyId = process.env.FILES_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.FILES_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.FILES_R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "File storage is not configured (FILES_R2_ACCOUNT_ID, FILES_R2_ACCESS_KEY_ID, FILES_R2_SECRET_ACCESS_KEY, FILES_R2_BUCKET)",
    );
  }
  r2Config = {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return r2Config;
}

// ── Keys and stored URLs ────────────────────────────────────────────────────

function safeSegment(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned || "file";
}

/** Key prefix inside the bucket, e.g. storageFolder(companyId, "files"). */
export function storageFolder(...segments: string[]) {
  return segments.map(safeSegment).join("/");
}

function buildKey(folder: string, fileName: string) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const name = `${safeSegment(base)}-${randomUUID().slice(0, 8)}`;
  return `${folder}/${ext ? `${name}.${ext}` : name}`;
}

function toStoredUrl(bucket: string, key: string) {
  return `r2://${bucket}/${key}`;
}

export function parseR2Url(url: string): { bucket: string; key: string } | null {
  const match = /^r2:\/\/([^/]+)\/(.+)$/.exec(url);
  return match ? { bucket: match[1], key: match[2] } : null;
}

/** True when the URL is a file in this deployment's bucket, inside `folder`. */
export function isStoredFileInFolder(url: string, folder: string) {
  const ref = parseR2Url(url);
  return Boolean(ref && ref.bucket === r2().bucket && ref.key.startsWith(`${folder}/`));
}

// ── Legacy providers (read + delete only) ───────────────────────────────────

export function isLegacyBlobUrl(url: string) {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

type CloudinaryFileRef = {
  resourceType: "image" | "video" | "raw";
  deliveryType: string;
  version: string | null;
  publicId: string;
  format: string | null;
};

export function parseCloudinaryUrl(url: string): CloudinaryFileRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "res.cloudinary.com") return null;

  const [, resourceType, deliveryType, ...rest] = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (!["image", "video", "raw"].includes(resourceType) || !deliveryType) return null;

  let i = 0;
  if (rest[i]?.startsWith("s--") && rest[i].endsWith("--")) i += 1;
  let version: string | null = null;
  if (/^v\d+$/.test(rest[i] ?? "")) {
    version = rest[i].slice(1);
    i += 1;
  }
  const path = rest.slice(i).join("/");
  if (!path) return null;

  const base = { resourceType: resourceType as CloudinaryFileRef["resourceType"], deliveryType, version };
  if (resourceType === "raw") return { ...base, publicId: path, format: null };
  const dot = path.lastIndexOf(".");
  if (dot > path.lastIndexOf("/")) {
    return { ...base, publicId: path.slice(0, dot), format: path.slice(dot + 1) };
  }
  return { ...base, publicId: path, format: null };
}

function cloudinaryDeliveryUrl(url: string, ref: CloudinaryFileRef) {
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

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * A URL the browser (or server) can fetch for a stored file, or null when the
 * file is a legacy Blob object (those must be streamed with the Blob token).
 */
export async function storedFileDeliveryUrl(
  url: string,
  options?: { fileName?: string | null; mimeType?: string | null; download?: boolean },
): Promise<string | null> {
  const ref = parseR2Url(url);
  if (ref) {
    const { client } = r2();
    const fileName = options?.fileName?.replace(/["\r\n]/g, "");
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: ref.bucket,
        Key: ref.key,
        ...(options?.mimeType ? { ResponseContentType: options.mimeType } : {}),
        ...(fileName
          ? {
              ResponseContentDisposition: `${options?.download ? "attachment" : "inline"}; filename="${fileName}"`,
            }
          : {}),
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
  }
  const cloudinaryRef = parseCloudinaryUrl(url);
  if (cloudinaryRef) return cloudinaryDeliveryUrl(url, cloudinaryRef);
  return null;
}

/** Fetch a stored file server-side (R2, or a legacy provider). */
export async function fetchStoredFile(url: string, init?: { range?: string | null }) {
  const headers: Record<string, string> = {};
  if (init?.range) headers.Range = init.range;

  const delivery = await storedFileDeliveryUrl(url);
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

// ── Writing ─────────────────────────────────────────────────────────────────

/** Server-side upload for small files (receipts, settings files, waybill PDFs, voices). */
export async function uploadStoredFile(input: {
  folder: string;
  fileName: string;
  mimeType: string | null;
  bytes: Buffer;
}): Promise<StoredFile> {
  const { bucket, client } = r2();
  const key = buildKey(input.folder, input.fileName);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.bytes,
      ContentType: input.mimeType || "application/octet-stream",
    }),
  );
  return { url: toStoredUrl(bucket, key), key, sizeBytes: input.bytes.length };
}

/** Null when the file can be stored, otherwise a message for the user. */
export function storageSizeError(sizeBytes: number) {
  if (sizeBytes <= MAX_FILE_BYTES) return null;
  return "File too large. Maximum size is 2GB";
}

/**
 * Start a browser-direct multipart upload. The server picks the key, so the
 * browser can only write where it was told; each part gets its own signed PUT.
 */
export async function startDirectUpload(input: {
  folder: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
}) {
  const { bucket, client } = r2();
  const key = buildKey(input.folder, input.fileName);
  const created = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.mimeType || "application/octet-stream",
    }),
  );
  if (!created.UploadId) throw new Error("R2 did not return an upload id");

  const partCount = Math.max(1, Math.ceil(input.fileSize / UPLOAD_PART_BYTES));
  const partUrls = await Promise.all(
    Array.from({ length: partCount }, (_, i) =>
      getSignedUrl(
        client,
        new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: created.UploadId, PartNumber: i + 1 }),
        { expiresIn: UPLOAD_URL_SECONDS },
      ),
    ),
  );

  return {
    url: toStoredUrl(bucket, key),
    uploadId: created.UploadId,
    partSize: UPLOAD_PART_BYTES,
    partUrls,
  };
}

/** Finish a multipart upload; returns the stored size as R2 reports it. */
export async function completeDirectUpload(input: {
  url: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}) {
  const ref = parseR2Url(input.url);
  if (!ref) throw new Error("Invalid file URL");
  const { client } = r2();
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: ref.bucket,
      Key: ref.key,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: [...input.parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }),
  );
  const head = await client.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
  return { sizeBytes: head.ContentLength ?? 0 };
}

export async function abortDirectUpload(input: { url: string; uploadId: string }) {
  const ref = parseR2Url(input.url);
  if (!ref) return;
  await r2().client.send(
    new AbortMultipartUploadCommand({ Bucket: ref.bucket, Key: ref.key, UploadId: input.uploadId }),
  );
}

// ── Deleting ────────────────────────────────────────────────────────────────

/**
 * Remove a stored file. R2 files move to `trash/` (purged after 30 days by
 * the bucket lifecycle rule); legacy files are deleted from their provider.
 */
export async function deleteStoredFile(url: string) {
  const ref = parseR2Url(url);
  if (ref) {
    if (ref.key.startsWith(TRASH_PREFIX)) return;
    const { client } = r2();
    await client.send(
      new CopyObjectCommand({
        Bucket: ref.bucket,
        Key: `${TRASH_PREFIX}${ref.key}`,
        CopySource: `${ref.bucket}/${ref.key.split("/").map(encodeURIComponent).join("/")}`,
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
    return;
  }

  const cloudinaryRef = parseCloudinaryUrl(url);
  if (cloudinaryRef) {
    const res = (await cloudinary.uploader.destroy(cloudinaryRef.publicId, {
      resource_type: cloudinaryRef.resourceType,
      type: cloudinaryRef.deliveryType,
      invalidate: true,
    })) as { result?: string };
    if (res.result !== "ok" && res.result !== "not found") {
      throw new Error(`Cloudinary delete failed for ${cloudinaryRef.publicId}: ${res.result ?? "unknown"}`);
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
