import { NextRequest, NextResponse } from "next/server";
import { CosmoAcademyMediaType } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { getProductFamilyName } from "@/lib/product-item-family";
import { requirePermission } from "@/lib/rbac";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_VOICE_SIZE = 30 * 1024 * 1024;
const ALLOWED_VOICE_BASE_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/x-m4a",
  "audio/aac",
  "audio/x-wav",
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
  const auth = await requirePermission("academy.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
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
  const auth = await requirePermission("academy.manage");
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
  const isRecorded = formData.get("isRecorded") !== "false";
  const file = formData.get("file");

  if (!productItemId) {
    return NextResponse.json({ error: "Product item is required" }, { status: 400 });
  }
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Voice recording is required" }, { status: 400 });
  }
  const baseMimeType = file.type.split(";")[0].trim();
  if (!ALLOWED_VOICE_BASE_TYPES.has(baseMimeType)) {
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
  const targetFamilyName = getProductFamilyName(productItem.productTitle);

  let fileName: string;
  let blobPath: string;

  if (isRecorded) {
    // Auto-name recorded voices: "Family Name Part 01.webm"
    const allFamilyItems = await prisma.productItem.findMany({
      where: { companyId },
      select: { shopifyProductId: true, id: true, productTitle: true },
      distinct: ["shopifyProductId"],
    });
    const familyProductKeys = allFamilyItems
      .filter((i) => getProductFamilyName(i.productTitle) === targetFamilyName)
      .map((i) => i.shopifyProductId || i.id);

    const existingVoiceCount = await prisma.cosmoAcademyMedia.count({
      where: {
        mediaType: CosmoAcademyMediaType.voice,
        explanation: { companyId, productKey: { in: familyProductKeys } },
      },
    });

    const partNumber = String(existingVoiceCount + 1).padStart(2, "0");
    fileName = `${academyProductTitle} Part ${partNumber}.webm`;
    blobPath = `academy/${safeFilePart(companyId)}/${safeFilePart(academyProductTitle)}-part-${partNumber}-${Date.now()}.webm`;
  } else {
    // Uploaded file — keep original filename
    fileName = file.name || `${safeFilePart(productKey)}-${Date.now()}`;
    const ext = fileName.split(".").pop() ?? "webm";
    blobPath = `academy/${safeFilePart(companyId)}/${safeFilePart(productKey)}-${Date.now()}.${ext}`;
  }

  let blobUrl: string;
  let cloudinaryPublicId: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${baseMimeType};base64,${buffer.toString("base64")}`;
    // Cloudinary public_id must not include a file extension; strip it from blobPath
    const publicId = blobPath.replace(/\.[^.]+$/, "");
    const result = await cloudinary.uploader.upload(dataUri, {
      public_id: publicId,
      resource_type: "video",
      overwrite: false,
    });
    blobUrl = result.secure_url;
    cloudinaryPublicId = result.public_id;
  } catch (err) {
    console.error("[academy] Cloudinary upload failed:", err);
    return NextResponse.json({ error: "Failed to upload voice file" }, { status: 500 });
  }

  let explanation: Awaited<ReturnType<typeof prisma.cosmoAcademyExplanation.create>>;
  try {
    explanation = await prisma.cosmoAcademyExplanation.create({
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
            url: blobUrl,
            provider: "cloudinary",
            publicId: cloudinaryPublicId,
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
  } catch (err) {
    console.error("[academy] DB create failed:", err);
    return NextResponse.json({ error: "Failed to save explanation" }, { status: 500 });
  }

  await writeAuditLog({
    companyId,
    actorUserId: user.id,
    module: "academy",
    action: "academy_explanation_created",
    entityType: "CosmoAcademyExplanation",
    entityId: explanation.id,
    summary: `Created explanation for ${academyProductTitle}`,
    metadata: { productTitle: academyProductTitle, fileName, isRecorded },
  });

  // Sync voice to ProductItemAsset storage for every SKU in the same product family.
  // Non-fatal — explanation is already saved above, storage sync is best-effort.
  try {
    const allDistinctItems = await prisma.productItem.findMany({
      where: { companyId, sku: { not: null } },
      select: { productTitle: true, sku: true },
      distinct: ["productTitle", "sku"],
    });
    const familySkus = [
      ...new Set(
        allDistinctItems
          .filter((i) => getProductFamilyName(i.productTitle) === targetFamilyName && i.sku)
          .map((i) => i.sku as string)
      ),
    ];
    if (familySkus.length > 0) {
      await prisma.productItemAsset.createMany({
        data: familySkus.map((sku) => ({
          companyId,
          sku,
          type: "audio",
          fileName,
          blobUrl,
          fileSize: file.size,
          mimeType: file.type,
          provider: "cloudinary",
          uploadedById: user.id,
        })),
        skipDuplicates: true,
      });
    }
  } catch {
    // Storage sync failed — explanation still saved
  }

  return NextResponse.json({ explanation }, { status: 201 });
}
