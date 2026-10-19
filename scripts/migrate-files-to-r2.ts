/**
 * One-time move of app files from Vercel Blob and Cloudinary into this
 * deployment's R2 bucket (FILES_R2_*), rewriting the URLs stored in:
 *   CosmoAcademyMedia.url, ProductItemAsset.blobUrl, File.blobUrl,
 *   BookNoteReceipt.blobUrl, OrderWaybill.rawPayload (cached CityPak PDFs)
 *
 * Only these tables are touched: logos and profile photos stay on Cloudinary.
 * Item Storage MP4/MOV videos without a recorded length get one from the file
 * header, so the SEO dashboard can split them into short / long.
 *
 * Run once per system (cosmo-prod, vault), each with its own env:
 *   npx tsx --env-file=.env.cosmo-prod scripts/migrate-files-to-r2.ts --dry-run
 *   npx tsx --env-file=.env.cosmo-prod scripts/migrate-files-to-r2.ts
 *   npx tsx --env-file=.env.cosmo-prod scripts/migrate-files-to-r2.ts --delete-source
 *     (--delete-source also removes the Blob / Cloudinary originals once copied)
 *
 * Needs FILES_R2_*, plus BLOB_READ_WRITE_TOKEN and CLOUDINARY_URL to read the
 * old files. Ask before prod. Safe to re-run: rows already on R2 are skipped,
 * and a URL shared by several rows is copied once.
 */

import { Prisma } from "@prisma/client";

import {
  deleteStoredFile,
  fetchStoredFileBytes,
  isLegacyBlobUrl,
  parseCloudinaryUrl,
  storageFolder,
  uploadStoredFile,
} from "../lib/file-storage";
import { readMp4DurationSeconds } from "../lib/media-duration";
import { prisma } from "../lib/prisma";

const dryRun = process.argv.includes("--dry-run");
const deleteSource = process.argv.includes("--delete-source");

const WAYBILL_PDF_KEYS = ["waybillPdfUrl", "waybillPdfUrlA4", "waybillPdfUrl4x6"];

type Moved = { url: string; sizeBytes: number; durationSeconds: number | null };

/** old URL → new R2 file, shared across tables (Academy voices are also storage rows). */
const moved = new Map<string, Moved | null>();
const failures: string[] = [];
let bytesMoved = 0;

function isLegacyUrl(url: string) {
  return isLegacyBlobUrl(url) || parseCloudinaryUrl(url) !== null;
}

/** Rows whose `field` still points at Blob or Cloudinary. */
function legacyUrlWhere<F extends string>(field: F) {
  return {
    OR: [
      { [field]: { contains: ".blob.vercel-storage.com/" } },
      { [field]: { startsWith: "https://res.cloudinary.com/" } },
    ] as Array<Record<F, { contains: string } | { startsWith: string }>>,
  };
}

function fileNameFromUrl(url: string) {
  return decodeURIComponent(new URL(url).pathname.split("/").pop() || "file");
}

async function moveFile(
  oldUrl: string,
  opts: { folder: string; fileName?: string | null; mimeType: string | null },
): Promise<Moved | null> {
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
    const durationSeconds = opts.mimeType?.startsWith("video/") ? readMp4DurationSeconds(bytes) : null;
    const result = { url: stored.url, sizeBytes: stored.sizeBytes, durationSeconds };
    moved.set(oldUrl, result);
    bytesMoved += stored.sizeBytes;
    return result;
  } catch (err) {
    failures.push(`${oldUrl}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function migrateAcademyMedia() {
  const rows = await prisma.cosmoAcademyMedia.findMany({
    where: legacyUrlWhere("url"),
    select: { id: true, url: true, fileName: true, mimeType: true, explanation: { select: { companyId: true } } },
  });
  for (const row of rows) {
    const result = await moveFile(row.url, {
      folder: storageFolder(row.explanation.companyId, "academy"),
      fileName: row.fileName,
      mimeType: row.mimeType,
    });
    if (result) {
      await prisma.cosmoAcademyMedia.update({
        where: { id: row.id },
        data: { url: result.url, provider: "r2", publicId: null },
      });
    }
  }
  return rows.length;
}

async function migrateProductItemAssets() {
  // One URL is shared by every SKU row in the family; move it once.
  const groups = await prisma.productItemAsset.groupBy({
    by: ["companyId", "blobUrl"],
    where: legacyUrlWhere("blobUrl"),
  });
  for (const group of groups) {
    const sample = await prisma.productItemAsset.findFirst({
      where: { companyId: group.companyId, blobUrl: group.blobUrl },
      select: { fileName: true, mimeType: true, durationSeconds: true },
    });
    const result = await moveFile(group.blobUrl, {
      folder: storageFolder(group.companyId, "product-items"),
      fileName: sample?.fileName,
      mimeType: sample?.mimeType ?? null,
    });
    if (result) {
      await prisma.productItemAsset.updateMany({
        where: { companyId: group.companyId, blobUrl: group.blobUrl },
        data: {
          blobUrl: result.url,
          provider: "r2",
          durationSeconds: sample?.durationSeconds ?? result.durationSeconds,
        },
      });
    }
  }
  return groups.length;
}

async function migrateFiles() {
  const rows = await prisma.file.findMany({
    where: legacyUrlWhere("blobUrl"),
    select: { id: true, companyId: true, blobUrl: true, fileName: true, mimeType: true },
  });
  for (const row of rows) {
    const result = await moveFile(row.blobUrl, {
      folder: storageFolder(row.companyId, "files"),
      fileName: row.fileName,
      mimeType: row.mimeType,
    });
    if (result) {
      await prisma.file.update({ where: { id: row.id }, data: { blobUrl: result.url, provider: "r2" } });
    }
  }
  return rows.length;
}

async function migrateBookNoteReceipts() {
  const rows = await prisma.bookNoteReceipt.findMany({
    where: legacyUrlWhere("blobUrl"),
    select: { id: true, bookNoteDayId: true, blobUrl: true, fileName: true, mimeType: true },
  });
  for (const row of rows) {
    const result = await moveFile(row.blobUrl, {
      folder: storageFolder("book-notes", row.bookNoteDayId),
      fileName: row.fileName,
      mimeType: row.mimeType,
    });
    if (result) {
      await prisma.bookNoteReceipt.update({ where: { id: row.id }, data: { blobUrl: result.url } });
    }
  }
  return rows.length;
}

async function migrateWaybillPdfs() {
  const rows = await prisma.$queryRaw<Array<{ id: string; companyId: string; rawPayload: Prisma.JsonValue }>>`
    SELECT "id", "companyId", "rawPayload" FROM "OrderWaybill"
    WHERE "rawPayload"::text LIKE '%.blob.vercel-storage.com/%'
       OR "rawPayload"::text LIKE '%res.cloudinary.com/%'
  `;
  let count = 0;
  for (const row of rows) {
    const payload = { ...(row.rawPayload as Record<string, unknown>) };
    let changed = false;
    for (const key of WAYBILL_PDF_KEYS) {
      const value = payload[key];
      if (typeof value !== "string" || !isLegacyUrl(value)) continue;
      count += 1;
      const result = await moveFile(value, {
        folder: storageFolder(row.companyId, "citypak-waybills", row.id),
        fileName: `${row.id}.pdf`,
        mimeType: "application/pdf",
      });
      if (result) {
        payload[key] = result.url;
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
  if (!process.env.FILES_R2_BUCKET) throw new Error("FILES_R2_* must be set");
  console.log(
    dryRun ? "DRY RUN — nothing will be written" : `Migrating files → R2 bucket ${process.env.FILES_R2_BUCKET}`,
  );

  // Academy first: its URLs are shared with ProductItemAsset rows, which then reuse the copy.
  const counts = {
    academyMedia: await migrateAcademyMedia(),
    productItemAssetFiles: await migrateProductItemAssets(),
    settingsFiles: await migrateFiles(),
    bookNoteReceipts: await migrateBookNoteReceipts(),
    waybillPdfs: await migrateWaybillPdfs(),
  };
  console.table(counts);

  if (dryRun) {
    console.log(`Distinct files to move: ${moved.size}`);
  } else {
    const done = [...moved.values()].filter(Boolean).length;
    console.log(`Distinct files moved: ${done} (${(bytesMoved / 1024 / 1024).toFixed(1)} MB)`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} file(s) failed — their rows still point at the old provider:`);
    for (const failure of failures) console.error(`  ${failure}`);
  }

  if (deleteSource && !dryRun) {
    let deleted = 0;
    for (const [oldUrl, result] of moved) {
      if (!result) continue;
      try {
        await deleteStoredFile(oldUrl);
        deleted += 1;
      } catch (err) {
        console.error(`  could not delete ${oldUrl}:`, err);
      }
    }
    console.log(`Deleted ${deleted} original(s) from Blob / Cloudinary.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
