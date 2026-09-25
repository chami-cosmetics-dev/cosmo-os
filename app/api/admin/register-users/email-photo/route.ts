import { v2 as cloudinary } from "cloudinary";
import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import {
  REGISTER_EMAIL_PHOTO_MAX_BYTES,
  isRemoteEmailPhotoUrl,
  parseStoredEmailPhoto,
  registerEmailPhotoMime,
  toEmailPhotoDataUrl,
} from "@/lib/register-users/email-photo";
import {
  getOrCreateRegisterSettings,
  upsertRegisterEmailTemplate,
} from "@/lib/register-users/settings";

export const dynamic = "force-dynamic";

const CLOUDINARY_FOLDER = "cosmo-os";

function asUploadBlob(value: FormDataEntryValue | null): {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
} | null {
  if (!value || typeof value !== "object") return null;
  if (typeof (value as Blob).arrayBuffer !== "function") return null;
  const blob = value as Blob;
  const name =
    "name" in value && typeof (value as File).name === "string"
      ? (value as File).name
      : "photo.jpg";
  return {
    name,
    type: blob.type || "",
    size: blob.size,
    arrayBuffer: () => blob.arrayBuffer(),
  };
}

export async function GET() {
  const auth = await requirePermission("contacts.register");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const settings = await getOrCreateRegisterSettings(companyId);
  const stored = settings.emailPhotoUrl;
  if (isRemoteEmailPhotoUrl(stored)) {
    return NextResponse.redirect(stored.trim());
  }
  const parsed = parseStoredEmailPhoto(stored);
  if (parsed) {
    return new NextResponse(parsed.buffer, {
      headers: {
        "Content-Type": parsed.mime,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return NextResponse.json({ error: "No photo" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("contacts.register");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  if (!process.env.CLOUDINARY_URL) {
    return NextResponse.json(
      { error: "Cloudinary is not configured" },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = asUploadBlob(formData.get("file"));
  if (!file) {
    return NextResponse.json({ error: "Photo is required" }, { status: 400 });
  }
  const mime = registerEmailPhotoMime(file);
  if (!mime) {
    return NextResponse.json(
      { error: "Use a JPG, PNG, WEBP, or GIF photo" },
      { status: 400 },
    );
  }
  if (file.size > REGISTER_EMAIL_PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { error: "Photo too large (max 5MB)" },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUri = toEmailPhotoDataUrl(mime, buffer);
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: CLOUDINARY_FOLDER,
      public_id: `register-email-${companyId}`,
      overwrite: true,
      resource_type: "image",
    });
    if (!result?.secure_url) {
      throw new Error("Upload failed");
    }

    const current = await getOrCreateRegisterSettings(companyId);
    await upsertRegisterEmailTemplate(companyId, {
      header: current.emailHeader,
      body: current.emailBody,
      photoUrl: result.secure_url,
    });
    return NextResponse.json({ photoUrl: result.secure_url });
  } catch (err) {
    console.error("Register email photo Cloudinary error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Photo upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
