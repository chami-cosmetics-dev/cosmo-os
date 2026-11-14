import "server-only";

import { uploadStoredFile } from "@/lib/file-storage";

function parseImagePayload(raw: string): { bytes: Buffer; mimeType: string; ext: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const dataUri = trimmed.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (dataUri) {
    const mimeType = dataUri[1]!.toLowerCase().replace("image/jpg", "image/jpeg");
    const bytes = Buffer.from(dataUri[2]!, "base64");
    if (bytes.length < 32 || bytes.length > 4_500_000) return null;
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    return { bytes, mimeType, ext };
  }

  // Raw base64 — assume JPEG.
  try {
    const bytes = Buffer.from(trimmed, "base64");
    if (bytes.length < 32 || bytes.length > 4_500_000) return null;
    return { bytes, mimeType: "image/jpeg", ext: "jpg" };
  } catch {
    return null;
  }
}

export async function uploadCardSlipImage(input: {
  companyId: string;
  orderId: string;
  imageBase64: string;
}): Promise<{ url: string } | { error: string }> {
  const parsed = parseImagePayload(input.imageBase64);
  if (!parsed) {
    return { error: "Invalid card slip photo" };
  }

  try {
    const stored = await uploadStoredFile({
      folder: `rider-card-slips/${input.companyId}`,
      fileName: `${input.orderId}-${Date.now()}.${parsed.ext}`,
      mimeType: parsed.mimeType,
      bytes: parsed.bytes,
    });
    return { url: stored.url };
  } catch (err) {
    console.error("[Mobile card slip] upload failed:", err);
    return { error: "Could not upload card slip photo" };
  }
}

export function resolveCardLast4(input: {
  cardLast4?: string | null;
  cardReference?: string | null;
}): string | null {
  const candidate = (input.cardLast4 ?? input.cardReference ?? "").trim();
  return /^\d{4}$/.test(candidate) ? candidate : null;
}
