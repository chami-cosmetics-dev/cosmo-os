import { NextRequest, NextResponse } from "next/server";
import { CosmoAcademyMediaType } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const MAX_VOICE_SIZE = 30 * 1024 * 1024;
const CLOUDINARY_FOLDER = "cosmo-os/academy";
const ALLOWED_VOICE_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
]);

function toAcademyProductName(productTitle: string) {
  return productTitle
    .replace(/\s+\d+(?:\.\d+)?\s*(?:ml|l|g|kg|mg|oz|pcs|pc|tabs|tablets|caps|capsules)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function safeFilePart(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET() {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  if (!process.env.CLOUDINARY_URL) {
    return NextResponse.json({ error: "Cloudinary is not configured" }, { status: 503 });
  }

  const explanations = await prisma.cosmoAcademyExplanation.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      productTitle: true,
      title: true,
      notes: true,
      createdAt: true,
      primaryProductItem: {
        select: {
          sku: true,
          variantTitle: true,
          imageUrl: true,
        },
      },
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
      media: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          mediaType: true,
          url: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  });

  return NextResponse.json({ explanations });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = auth.context!.user!;
  const companyId = user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const productItemId = String(formData.get("productItemId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const file = formData.get("file");

  if (!productItemId) {
    return NextResponse.json({ error: "Product item is required" }, { status: 400 });
  }
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Voice recording is required" }, { status: 400 });
  }
  if (!ALLOWED_VOICE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported voice recording type" }, { status: 400 });
  }
  if (file.size > MAX_VOICE_SIZE) {
    return NextResponse.json({ error: "Voice recording is too large" }, { status: 400 });
  }

  const productItem = await prisma.productItem.findFirst({
    where: { id: productItemId, companyId },
    select: {
      id: true,
      shopifyProductId: true,
      productTitle: true,
      variantTitle: true,
      sku: true,
    },
  });
  if (!productItem) {
    return NextResponse.json({ error: "Product item not found" }, { status: 404 });
  }

  const productKey = productItem.shopifyProductId || productItem.id;
  const academyProductTitle = toAcademyProductName(productItem.productTitle);
  const fileName = file.name || `${safeFilePart(productKey)}.webm`;
  const publicId = `${safeFilePart(companyId)}-${safeFilePart(productKey)}-${Date.now()}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;
  const uploadResult = await cloudinary.uploader.upload(dataUri, {
    folder: CLOUDINARY_FOLDER,
    public_id: publicId,
    resource_type: "video",
  });

  if (!uploadResult.secure_url) {
    return NextResponse.json({ error: "Failed to upload voice file" }, { status: 500 });
  }

  const explanation = await prisma.cosmoAcademyExplanation.create({
    data: {
      companyId,
      primaryProductItemId: productItem.id,
      createdById: user.id,
      productKey,
      shopifyProductId: productItem.shopifyProductId,
      productTitle: academyProductTitle,
      title: title || `${academyProductTitle} explanation`,
      notes: notes || null,
      media: {
        create: {
          mediaType: CosmoAcademyMediaType.voice,
          url: uploadResult.secure_url,
          provider: "cloudinary",
          publicId: uploadResult.public_id,
          fileName,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      },
    },
    include: {
      media: true,
      primaryProductItem: {
        select: {
          sku: true,
          variantTitle: true,
          imageUrl: true,
        },
      },
    },
  });

  return NextResponse.json({ explanation }, { status: 201 });
}
