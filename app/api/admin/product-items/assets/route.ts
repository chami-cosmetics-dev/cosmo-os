import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { getProductFamilyName } from "@/lib/product-item-family";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type RawStorageAsset = {
  id: string;
  sku: string;
  type: string;
  fileName: string;
  blobUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  provider: string;
  createdAt: Date;
  uploadedBy: { id: string; name: string | null } | null;
};

type AcademyMediaRecord = {
  id: string;
  url: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  provider: string | null;
  createdAt: Date;
};

type AcademyExplanationRecord = {
  createdBy: { name: string | null } | null;
  createdAt: Date;
  media: AcademyMediaRecord[];
};

async function getFamilyItems(companyId: string, familyName: string) {
  const allItems = await prisma.productItem.findMany({
    where: { companyId },
    select: { productTitle: true, sku: true, shopifyProductId: true, id: true },
    distinct: ["productTitle", "sku"],
  });
  return allItems.filter((i) => getProductFamilyName(i.productTitle) === familyName);
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("products.storage.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const familyName = request.nextUrl.searchParams.get("familyName");
  if (!familyName) {
    return NextResponse.json({ error: "familyName is required" }, { status: 400 });
  }

  const familyItems = await getFamilyItems(companyId, familyName);
  const familySkus = [...new Set(familyItems.filter((i) => i.sku).map((i) => i.sku as string))];
  const familyProductKeys = [...new Set(familyItems.map((i) => i.shopifyProductId || i.id))];

  const [rawAssets, academyExplanations] = await Promise.all([
    familySkus.length > 0
      ? prisma.productItemAsset.findMany({
          where: { companyId, sku: { in: familySkus } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            sku: true,
            type: true,
            fileName: true,
            blobUrl: true,
            fileSize: true,
            mimeType: true,
            provider: true,
            createdAt: true,
            uploadedBy: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([] as RawStorageAsset[]),
    familyProductKeys.length > 0
      ? prisma.cosmoAcademyExplanation.findMany({
          where: { companyId, productKey: { in: familyProductKeys } },
          select: {
            createdBy: { select: { name: true } },
            createdAt: true,
            media: {
              select: {
                id: true,
                url: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                provider: true,
                createdAt: true,
              },
            },
          },
        })
      : Promise.resolve([] as AcademyExplanationRecord[]),
  ]) as [RawStorageAsset[], AcademyExplanationRecord[]];

  const seenUrls = new Set<string>();

  const storageAssets = rawAssets
    .filter((a) => {
      if (seenUrls.has(a.blobUrl)) return false;
      seenUrls.add(a.blobUrl);
      return true;
    })
    .map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      proxyUrl: `/api/admin/product-items/assets/${a.id}`,
      source: "storage" as const,
    }));

  const academyAssets = academyExplanations.flatMap((exp) =>
    exp.media
      .filter((m) => {
        if (seenUrls.has(m.url)) return false;
        seenUrls.add(m.url);
        return true;
      })
      .map((m) => ({
        id: m.id,
        sku: familySkus[0] ?? "",
        type: "audio" as const,
        fileName: m.fileName ?? "voice-explanation.webm",
        blobUrl: m.url,
        fileSize: m.sizeBytes,
        mimeType: m.mimeType,
        provider: m.provider ?? "vercel_blob",
        createdAt: (m.createdAt ?? exp.createdAt).toISOString(),
        uploadedBy: exp.createdBy ? { id: "", name: exp.createdBy.name } : null,
        proxyUrl: `/api/admin/cosmo-academy/media/${m.id}`,
        source: "academy" as const,
      }))
  );

  const assets = [...storageAssets, ...academyAssets].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return NextResponse.json({ assets });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("products.storage.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const userId = auth.context!.user!.id;
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    sku?: string;
    productTitle?: string;
    type?: string;
    fileName?: string;
    blobUrl?: string;
    fileSize?: number;
    mimeType?: string;
  } | null;

  if (!body?.sku || !body.type || !body.fileName || !body.blobUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validTypes = ["image", "video", "audio", "document"];
  if (!validTypes.includes(body.type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  // Compute family name and all SKUs to save under
  const familyName = body.productTitle ? getProductFamilyName(body.productTitle) : null;
  const familyItems = familyName ? await getFamilyItems(companyId, familyName) : [];
  const familySkus = familyItems.filter((i) => i.sku).map((i) => i.sku as string);
  const uniqueSkus = [...new Set([body.sku, ...familySkus])];

  // Count distinct existing files of this type across the family to generate sequential name
  const ext = (body.fileName.split(".").pop() ?? "bin").toLowerCase();
  let savedFileName = body.fileName;

  if (familyName && familySkus.length > 0) {
    const existingDistinct = await prisma.productItemAsset.findMany({
      where: { companyId, sku: { in: familySkus }, type: body.type },
      select: { blobUrl: true },
      distinct: ["blobUrl"],
    });
    const partNumber = String(existingDistinct.length + 1).padStart(2, "0");
    savedFileName = `${familyName}_${partNumber}.${ext}`;
  }

  await prisma.productItemAsset.createMany({
    data: uniqueSkus.map((sku) => ({
      companyId,
      sku,
      type: body.type!,
      fileName: savedFileName,
      blobUrl: body.blobUrl!,
      fileSize: body.fileSize ?? null,
      mimeType: body.mimeType ?? null,
      provider: "vercel_blob",
      uploadedById: userId,
    })),
    skipDuplicates: true,
  });

  await writeAuditLog({
    companyId,
    actorUserId: userId,
    module: "products",
    action: "storage_file_uploaded",
    entityType: "ProductItemAsset",
    summary: `Uploaded ${savedFileName} (${body.type}) for ${familyName ?? body.sku}`,
    metadata: { fileName: savedFileName, type: body.type, sku: body.sku, familyName, skuCount: uniqueSkus.length },
  });

  return NextResponse.json({ ok: true });
}
