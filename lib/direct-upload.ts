/**
 * Browser-side multipart upload to R2 through a route that signs each part
 * (see startDirectUpload / completeDirectUpload in lib/file-storage.ts).
 *
 * Parts go up three at a time and each part is retried with backoff, waiting
 * for the connection to come back if the browser goes offline, so a dropped
 * office connection pauses a 300 MB video instead of failing it.
 */

type StartResponse = {
  url: string;
  uploadId: string;
  partSize: number;
  partUrls: string[];
  error?: string;
};

export type DirectUploadResult = {
  url: string;
  sizeBytes: number;
};

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 6;

async function postJson<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Upload request failed (HTTP ${res.status})`);
  return json;
}

function waitForOnline() {
  if (typeof navigator === "undefined" || navigator.onLine) return Promise.resolve();
  return new Promise<void>((resolve) => window.addEventListener("online", () => resolve(), { once: true }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function putPart(url: string, body: Blob): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await waitForOnline();
    try {
      const res = await fetch(url, { method: "PUT", body });
      if (res.ok) {
        const etag = res.headers.get("ETag");
        // Missing ETag means the bucket CORS policy does not expose it.
        if (!etag) throw new Error("Upload blocked: storage CORS must expose the ETag header");
        return etag;
      }
      // 4xx other than timeouts / rate limits will not fix themselves.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        throw new Error(`Upload rejected (HTTP ${res.status})`);
      }
      lastError = new Error(`Upload failed (HTTP ${res.status})`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Upload blocked")) throw err;
      if (err instanceof Error && err.message.startsWith("Upload rejected")) throw err;
      lastError = err;
    }
    await sleep(Math.min(1000 * 2 ** (attempt - 1), 16_000));
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed");
}

export async function uploadFileDirect(
  endpoint: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<DirectUploadResult> {
  const started = await postJson<StartResponse>(endpoint, {
    action: "start",
    fileName: file.name,
    mimeType: file.type || null,
    fileSize: file.size,
  });

  const parts: Array<{ partNumber: number; etag: string }> = [];
  let uploadedBytes = 0;
  let next = 0;

  const worker = async () => {
    while (next < started.partUrls.length) {
      const index = next;
      next += 1;
      const start = index * started.partSize;
      const chunk = file.slice(start, Math.min(start + started.partSize, file.size));
      const etag = await putPart(started.partUrls[index], chunk);
      parts.push({ partNumber: index + 1, etag });
      uploadedBytes += chunk.size;
      onProgress?.(uploadedBytes / file.size);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, started.partUrls.length) }, worker));
    const done = await postJson<{ sizeBytes: number }>(endpoint, {
      action: "complete",
      url: started.url,
      uploadId: started.uploadId,
      parts,
    });
    return { url: started.url, sizeBytes: done.sizeBytes || file.size };
  } catch (err) {
    void postJson(endpoint, { action: "abort", url: started.url, uploadId: started.uploadId }).catch(() => {});
    throw err;
  }
}

/**
 * Length of a video/audio file in seconds, read by the browser before upload.
 * Null when the browser cannot decode it (e.g. HEVC .mov in Chrome).
 */
export function readMediaDurationSeconds(file: File): Promise<number | null> {
  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    const src = URL.createObjectURL(file);
    const finish = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(src);
      element.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 15_000);
    element.preload = "metadata";
    element.onloadedmetadata = () =>
      finish(Number.isFinite(element.duration) ? Math.round(element.duration) : null);
    element.onerror = () => finish(null);
    element.src = src;
  });
}
