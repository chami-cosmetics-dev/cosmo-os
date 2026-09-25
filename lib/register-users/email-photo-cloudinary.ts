import { v2 as cloudinary } from "cloudinary";

import { parseStoredEmailPhoto } from "@/lib/register-users/email-photo";

const CLOUDINARY_FOLDER = "cosmo-os";
export const REGISTER_EMAIL_PHOTO_CID = "register-photo";
const MAIL_PHOTO_MAX_BYTES = 350_000;

export async function uploadRegisterEmailPhotoToCloudinary(
  companyId: string,
  dataUri: string,
): Promise<string> {
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: CLOUDINARY_FOLDER,
    public_id: `register-email-${companyId}`,
    overwrite: true,
    resource_type: "image",
  });
  if (!result.secure_url) throw new Error("Photo upload failed");
  return result.secure_url;
}

export function cloudinaryMailPhotoUrl(url: string): string {
  if (!url.includes("res.cloudinary.com") || !/\/upload\//.test(url)) {
    return url;
  }
  if (/\/upload\/[^/]*w_/.test(url)) return url;
  return url.replace("/upload/", "/upload/w_800,q_auto,f_jpg/");
}

export type WelcomePhotoForMail = {
  photoSrc: string;
  remoteUrl: string;
  attachment?: {
    filename: string;
    contentType: string;
    buffer: Buffer;
    inline: true;
    contentId: string;
  };
};

export async function resolveWelcomePhotoForMail(input: {
  companyId: string;
  stored: string | null | undefined;
}): Promise<WelcomePhotoForMail | null> {
  const stored = input.stored?.trim();
  if (!stored) return null;

  let remote = /^https?:\/\//i.test(stored) ? stored : null;
  if (!remote) {
    const parsed = parseStoredEmailPhoto(stored);
    if (!parsed || !process.env.CLOUDINARY_URL) return null;
    const dataUri = `data:${parsed.mime};base64,${parsed.buffer.toString("base64")}`;
    remote = await uploadRegisterEmailPhotoToCloudinary(
      input.companyId,
      dataUri,
    );
  }

  const fetchUrl = cloudinaryMailPhotoUrl(remote);
  try {
    const res = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 0 && buffer.length <= MAIL_PHOTO_MAX_BYTES) {
        const mime = res.headers.get("content-type")?.split(";")[0]?.trim();
        return {
          photoSrc: `cid:${REGISTER_EMAIL_PHOTO_CID}`,
          remoteUrl: remote,
          attachment: {
            filename: "register-photo.jpg",
            contentType:
              mime && mime.startsWith("image/") ? mime : "image/jpeg",
            buffer,
            inline: true,
            contentId: REGISTER_EMAIL_PHOTO_CID,
          },
        };
      }
    }
  } catch {
    // Remote img src still works if the fetch/attach step fails.
  }

  return { photoSrc: remote, remoteUrl: remote };
}
