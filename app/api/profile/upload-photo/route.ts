import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";

const CLOUDINARY_FOLDER = "cosmo-os";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.CLOUDINARY_URL) {
    return NextResponse.json(
      { error: "Cloudinary is not configured" },
      { status: 503 }
    );
  }

  const userId = context.user.id;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "File is required" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 5MB" },
      { status: 400 }
    );
  }

  const publicId = `${CLOUDINARY_FOLDER}/profile-${userId}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUri = `data:${file.type};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: CLOUDINARY_FOLDER,
      public_id: publicId.split("/").pop(),
      overwrite: true,
      resource_type: "image",
    });

    if (!result?.secure_url) {
      throw new Error("Upload failed");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { profilePhotoUrl: result.secure_url },
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}
