import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const CLOUDINARY_FOLDER = "cosmo-os";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  if (!process.env.CLOUDINARY_URL) {
    return NextResponse.json(
      { error: "Cloudinary is not configured" },
      { status: 503 }
    );
  }

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
  const type = formData.get("type");
  const locationId = formData.get("locationId");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "File is required" },
      { status: 400 }
    );
  }

  if (type !== "company" && type !== "location" && type !== "favicon") {
    return NextResponse.json(
      { error: "Invalid type. Must be 'company', 'location', or 'favicon'" },
      { status: 400 }
    );
  }

  if (type === "location") {
    if (!locationId || typeof locationId !== "string") {
      return NextResponse.json(
        { error: "locationId is required when type is 'location'" },
        { status: 400 }
      );
    }
    const idResult = cuidSchema.safeParse(locationId);
    if (!idResult.success) {
      return NextResponse.json({ error: "Invalid location ID" }, { status: 400 });
    }
    const location = await prisma.companyLocation.findFirst({
      where: { id: idResult.data, companyId },
    });
    if (!location) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }
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

  const publicId =
    type === "company"
      ? `${CLOUDINARY_FOLDER}/company-${companyId}`
      : type === "favicon"
        ? `${CLOUDINARY_FOLDER}/favicon-${companyId}`
        : `${CLOUDINARY_FOLDER}/location-${locationId}`;

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

    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
