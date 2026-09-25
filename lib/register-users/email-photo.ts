export const REGISTER_EMAIL_PHOTO_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const EXT_TO_MIME: Record<string, (typeof REGISTER_EMAIL_PHOTO_MIMES)[number]> =
  {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };

/** Same cap as company / profile Cloudinary uploads. */
export const REGISTER_EMAIL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const REGISTER_EMAIL_PHOTO_PREVIEW_PATH =
  "/api/admin/register-users/email-photo";

export type StoredEmailPhoto = {
  mime: (typeof REGISTER_EMAIL_PHOTO_MIMES)[number];
  buffer: Buffer;
};

export function parseStoredEmailPhoto(
  stored: string | null | undefined,
): StoredEmailPhoto | null {
  const trimmed = stored?.trim();
  if (!trimmed) return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(
    trimmed,
  );
  if (!match) return null;
  const rawMime = match[1].toLowerCase();
  const mime = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
  if (!(REGISTER_EMAIL_PHOTO_MIMES as readonly string[]).includes(mime)) {
    return null;
  }
  return {
    mime: mime as (typeof REGISTER_EMAIL_PHOTO_MIMES)[number],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export function isRemoteEmailPhotoUrl(
  stored: string | null | undefined,
): stored is string {
  return Boolean(stored && /^https?:\/\//i.test(stored.trim()));
}

export function toEmailPhotoDataUrl(
  mime: string,
  buffer: Buffer,
): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export function registerEmailPhotoMime(file: {
  name: string;
  type: string;
}): (typeof REGISTER_EMAIL_PHOTO_MIMES)[number] | null {
  const type = file.type.trim().toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (
    (REGISTER_EMAIL_PHOTO_MIMES as readonly string[]).includes(type)
  ) {
    return type as (typeof REGISTER_EMAIL_PHOTO_MIMES)[number];
  }
  const ext = file.name
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.split(".")
    .pop()
    ?.toLowerCase();
  return ext ? (EXT_TO_MIME[ext] ?? null) : null;
}

export function safeRegisterEmailPhotoName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() || "photo.jpg";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return cleaned || "photo.jpg";
}
