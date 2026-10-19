/**
 * One-time move of every legacy Vercel Blob file to Cloudinary (authenticated
 * delivery), rewriting the URLs stored in:
 *   CosmoAcademyMedia.url, ProductItemAsset.blobUrl, File.blobUrl,
 *   BookNoteReceipt.blobUrl, OrderWaybill.rawPayload (cached CityPak PDFs)
 *
 * Usage (after the 20261019120000_cloudinary_file_storage migration is deployed):
 *   npx tsx scripts/migrate-blob-to-cloudinary.ts --dry-run
 *   npx tsx scripts/migrate-blob-to-cloudinary.ts
 *   npx tsx scripts/migrate-blob-to-cloudinary.ts --delete-blob   # also remove the Blob originals
 *
 * Item Storage videos also get durationSeconds from Cloudinary, so the SEO
 * dashboard can split them into short / long.
 *
 * Needs both CLOUDINARY_URL and BLOB_READ_WRITE_TOKEN. Uses the active .env
 * (npm run env:use <target>). Ask before prod. Safe to re-run: rows already on
 * Cloudinary are skipped, and the same Blob URL is copied only once.
 */

import { Prisma } from "@prisma/client";
import { del } from "@vercel/blob";

import {
  fetchStoredFileBytes,
  isLegacyBlobUrl,
  storageFolder,
  uploadStoredFile,
  type StoredFile,
} from "../lib/file-storage";
import { prisma } from "../lib/prisma";

const dryRun = process.argv.includes("--dry-run");
const deleteBlob = process.argv.includes("--delete-blob");

const BLOB_HOST_LIKE = "%.blob.vercel-storage.com/%";
const WAYBILL_PDF_KEYS = ["waybillPdfUrl", "waybillPdfUrlA4", "waybillPdfUrl4x6"];

/** old Blob URL → new Cloudinary file, shared across tables (Academy voices are also storage rows). */
const moved = new Map<string, StoredFile | null>();
const failures: string[] = [];

function fileNameFromUrl(url: string) {
  return decodeURIComponent(new URL(url).pathname.split("/").pop() || "file");
}

async function moveFile(
  oldUrl: string,
  opts: { folder: string; fileName?: string | null; mimeType: string | null },
): Promise<StoredFile | null> {
  if (moved.has(oldUrl)) return moved.get(oldUrl)!;
  if (dryRun) {
    moved.set(oldUrl, null);
    return null;
  }
  try {
    const bytes = await fetchStoredFileBytes(oldUrl);
    const stored = await uploadStoredFile({
      folder: opts.folder,
      fileName: opts.fileName || fileNameFromUrl(oldUrl),
      mimeType: opts.mimeType,
      bytes,
    });
    moved.set(oldUrl, stored);
    return stored;
  } catch (err) {
    failures.push(`${oldUrl}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function migrateAcademyMedia() {
  const rows = await prisma.cosmoAcademyMedia.findMany({
    where: { url: { contains: ".blob.vercel-storage.com/" } },
    select: { id: true, url: true, fileName: true, mimeType: true, explanation: { select: { companyId: true } } },
  });
  for (const row of rows) {
    const stored = await moveFile(row.url, {
      folder: storageFolder(row.explanation.companyId, "academy"),
      fileName: row.fileName,
      mimeType: row.mimeType,
    });
    if (stored) {
      await prisma.cosmoAcademyMedia.update({
        where: { id: row.id },
        data: { url: stored.url, provider: "cloudinary", publicId: null },
      });
    }
  }
  return rows.length;
}

async function migrateProductItemAssets() {
  // One Blob URL is shared by every SKU row in the family; move it once.
  const groups = await prisma.productItemAsset.groupBy({
    by: ["companyId", "blobUrl"],
    where: { blobUrl: { contains: ".blob.vercel-storage.com/" } },
    _count: { _all: true },
  });
  for (const group of groups) {
    const sample = await prisma.productItemAsset.findFirst({
      where: { companyId: group.companyId, blobUrl: group.blobUrl },
      select: { fileName: true, mimeType: true },
    });
    const stored = await moveFile(group.blobUrl, {
      folder: storageFolder(group.companyId, "product-items"),
      fileName: sample?.fileName,
      mimeType: sample?.mimeType ?? null,
    });
    if (stored) {
      await prisma.productItemAsset.updateMany({
        where: { companyId: group.companyId, blobUrl: group.blobUrl },
        data: { blobUrl: stored.url, provider: "cloudinary", durationSeconds: stored.durationSeconds },
      });
    }
  }
  return groups.length;
}

async function migrateFiles() {
  const rows = await prisma.file.findMany({
    where: { blobUrl: { contains: ".blob.vercel-storage.com/" } },
    select: { id: true, companyId: true, blobUrl: true, fileName: true, mimeType: true },
  });
  for (const row of rows) {
    const stored = await moveFile(row.blobUrl, {
      folder: storageFolder(row.companyId, "files"),
      fileName: row.fileName,
      mimeType: row.mimeType,
    });
    if (stored) {
      await prisma.file.update({ where: { id: row.id }, data: { blobUrl: stored.url, provider: "cloudinary" } });
    }
  }
  return rows.length;
}

async function migrateBookNoteReceipts() {
  const rows = await prisma.bookNoteReceipt.findMany({
    where: { blobUrl: { contains: ".blob.vercel-storage.com/" } },
    select: { id: true, bookNoteDayId: true, blobUrl: true, fileName: true, mimeType: true },
  });
  for (const row of rows) {
    const stored = await moveFile(row.blobUrl, {
      folder: storageFolder("book-notes", row.bookNoteDayId),
      fileName: row.fileName,
      mimeType: row.mimeType,
    });
    if (stored) {
      await prisma.bookNoteReceipt.update({ where: { id: row.id }, data: { blobUrl: stored.url } });
    }
  }
  return rows.length;
}

async function migrateWaybillPdfs() {
  const rows = await prisma.$queryRaw<Array<{ id: string; companyId: string; rawPayload: Prisma.JsonValue }>>`
    SELECT "id", "companyId", "rawPayload" FROM "OrderWaybill"
    WHERE "rawPayload"::text LIKE ${BLOB_HOST_LIKE}
  `;
  let count = 0;
  for (const row of rows) {
    const payload = { ...(row.rawPayload as Record<string, unknown>) };
    let changed = false;
    for (const key of WAYBILL_PDF_KEYS) {
      const value = payload[key];
      if (typeof value !== "string" || !isLegacyBlobUrl(value)) continue;
      count += 1;
      const stored = await moveFile(value, {
        folder: storageFolder(row.companyId, "citypak-waybills", row.id),
        mimeType: "application/pdf",
      });
      if (stored) {
        payload[key] = stored.url;
        changed = true;
      }
    }
    if (changed) {
      await prisma.orderWaybill.update({
        where: { id: row.id },
        data: { rawPayload: payload as Prisma.InputJsonValue },
      });
    }
  }
  return count;
}

async function main() {
  if (!process.env.CLOUDINARY_URL || !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("CLOUDINARY_URL and BLOB_READ_WRITE_TOKEN must both be set");
  }
  console.log(dryRun ? "DRY RUN — nothing will be written" : "Migrating Blob → Cloudinary");

  // Academy first: its URLs are shared with ProductItemAsset rows, which then reuse the copy.
  const counts = {
    academyMedia: await migrateAcademyMedia(),
    productItemAssetFiles: await migrateProductItemAssets(),
    settingsFiles: await migrateFiles(),
    bookNoteReceipts: await migrateBookNoteReceipts(),
    waybillPdfs: await migrateWaybillPdfs(),
  };
  console.table(counts);
  const movedCount = [...moved.values()].filter(Boolean).length;
  console.log(dryRun ? `Distinct Blob files to move: ${moved.size}` : `Distinct Blob files moved: ${movedCount}`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} file(s) failed — their rows still point at Blob:`);
    for (const failure of failures) console.error(`  ${failure}`);
  }

  if (deleteBlob && !dryRun) {
    let deleted = 0;
    for (const [oldUrl, stored] of moved) {
      if (!stored) continue;
      try {
        await del(oldUrl);
        deleted += 1;
      } catch (err) {
        console.error(`  could not delete ${oldUrl}:`, err);
      }
    }
    console.log(`Deleted ${deleted} Blob original(s).`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
