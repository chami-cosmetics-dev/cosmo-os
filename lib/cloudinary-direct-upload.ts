/**
 * Browser-side upload to Cloudinary using parameters signed by our server
 * (see signDirectUpload in lib/file-storage.ts). Large files go up in chunks,
 * so a 500 MB video never has to fit in a single request.
 */

export type SignedUpload = {
  uploadUrl: string;
  fields: Record<string, string>;
};

export type DirectUploadResult = {
  secureUrl: string;
  bytes: number;
  /** Seconds (float) — Cloudinary sets this for video and audio. */
  duration: number | null;
};

const CHUNK_SIZE = 20 * 1024 * 1024;

type CloudinaryUploadJson = {
  secure_url?: string;
  bytes?: number;
  duration?: number;
  error?: { message?: string };
};

async function postPart(
  signed: SignedUpload,
  part: Blob,
  fileName: string,
  headers: Record<string, string>,
): Promise<CloudinaryUploadJson> {
  const form = new FormData();
  for (const [key, value] of Object.entries(signed.fields)) form.append(key, value);
  form.append("file", part, fileName);

  const res = await fetch(signed.uploadUrl, { method: "POST", body: form, headers });
  const json = (await res.json().catch(() => ({}))) as CloudinaryUploadJson;
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Upload failed (HTTP ${res.status})`);
  }
  return json;
}

export async function uploadToCloudinary(
  signed: SignedUpload,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<DirectUploadResult> {
  let json: CloudinaryUploadJson;

  if (file.size <= CHUNK_SIZE) {
    json = await postPart(signed, file, file.name, {});
  } else {
    const uploadId = crypto.randomUUID();
    json = {};
    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, file.size);
      json = await postPart(signed, file.slice(start, end), file.name, {
        "X-Unique-Upload-Id": uploadId,
        "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
      });
      onProgress?.(end / file.size);
    }
  }

  if (!json.secure_url) throw new Error("Upload finished without a file URL");
  onProgress?.(1);
  return {
    secureUrl: json.secure_url,
    bytes: json.bytes ?? file.size,
    duration: typeof json.duration === "number" ? json.duration : null,
  };
}
