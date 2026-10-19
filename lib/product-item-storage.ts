import { deleteStoredFileQuietly, storageFolder } from "@/lib/file-storage";
import { prisma } from "@/lib/prisma";

export function productItemStorageFolder(companyId: string) {
  return storageFolder(companyId, "product-items");
}

export type StorageFileRecord = {
  url: string;
  fileName: string;
  mimeType: string | null;
  type: string;
  sku: string | null;
};

/**
 * Resolve an id shown in the Item Storage sheet. Most rows are
 * ProductItemAsset ids; an Academy voice whose storage copy is missing is
 * listed under its CosmoAcademyMedia id instead.
 */
export async function findStorageFile(companyId: string, id: string): Promise<StorageFileRecord | null> {
  const asset = await prisma.productItemAsset.findFirst({
    where: { id, companyId },
    select: { blobUrl: true, fileName: true, mimeType: true, type: true, sku: true },
  });
  if (asset) {
    return { url: asset.blobUrl, fileName: asset.fileName, mimeType: asset.mimeType, type: asset.type, sku: asset.sku };
  }

  const media = await prisma.cosmoAcademyMedia.findFirst({
    where: { id, explanation: { companyId } },
    select: { url: true, fileName: true, mimeType: true },
  });
  if (media) {
    return {
      url: media.url,
      fileName: media.fileName ?? "voice-explanation.webm",
      mimeType: media.mimeType,
      type: "audio",
      sku: null,
    };
  }
  return null;
}

/**
 * Delete a file from every place that points at it: the per-SKU storage rows,
 * any Academy media using the same URL (and an explanation left with no media,
 * which would otherwise show as a broken lesson), then the file itself.
 */
export async function deleteStorageFileEverywhere(companyId: string, url: string) {
  const assets = await prisma.productItemAsset.deleteMany({ where: { companyId, blobUrl: url } });

  const media = await prisma.cosmoAcademyMedia.findMany({
    where: { url, explanation: { companyId } },
    select: { id: true, explanationId: true },
  });
  let explanationsDeleted = 0;
  if (media.length > 0) {
    await prisma.cosmoAcademyMedia.deleteMany({ where: { id: { in: media.map((m) => m.id) } } });
    const emptied = await prisma.cosmoAcademyExplanation.deleteMany({
      where: {
        companyId,
        id: { in: [...new Set(media.map((m) => m.explanationId))] },
        media: { none: {} },
      },
    });
    explanationsDeleted = emptied.count;
  }

  await deleteStoredFileQuietly(url, "product item storage");

  return { assetRows: assets.count, academyMedia: media.length, explanationsDeleted };
}
