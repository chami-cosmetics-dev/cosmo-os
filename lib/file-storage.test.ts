import { beforeAll, describe, expect, it } from "vitest";

type FileStorage = typeof import("@/lib/file-storage");
let fs: FileStorage;

beforeAll(async () => {
  process.env.FILES_R2_ACCOUNT_ID = "acct123";
  process.env.FILES_R2_ACCESS_KEY_ID = "AKIDTEST";
  process.env.FILES_R2_SECRET_ACCESS_KEY = "secret";
  process.env.FILES_R2_BUCKET = "cosmo-files-test";
  fs = await import("@/lib/file-storage");
});

describe("file-storage keys and URLs", () => {
  it("builds safe folders and parses r2:// URLs", () => {
    expect(fs.storageFolder("cmp 1", "product-items")).toBe("cmp-1/product-items");
    expect(fs.parseR2Url("r2://cosmo-files-test/cmp/files/a-1234.pdf")).toEqual({
      bucket: "cosmo-files-test",
      key: "cmp/files/a-1234.pdf",
    });
    expect(fs.parseR2Url("https://example.com/x")).toBeNull();
  });

  it("only accepts files in this bucket and folder", () => {
    const folder = fs.storageFolder("cmp1", "product-items");
    expect(fs.isStoredFileInFolder("r2://cosmo-files-test/cmp1/product-items/v-1.mp4", folder)).toBe(true);
    expect(fs.isStoredFileInFolder("r2://cosmo-files-test/cmp2/product-items/v-1.mp4", folder)).toBe(false);
    expect(fs.isStoredFileInFolder("r2://vault-files-prod/cmp1/product-items/v-1.mp4", folder)).toBe(false);
    expect(fs.isStoredFileInFolder("https://res.cloudinary.com/x/video/upload/v1/a.mp4", folder)).toBe(false);
  });

  it("signs short-lived GET URLs with the file name", async () => {
    const url = await fs.storedFileDeliveryUrl("r2://cosmo-files-test/cmp1/files/brief-1234.psd", {
      fileName: 'Brief "v2".psd',
      mimeType: "image/vnd.adobe.photoshop",
    });
    const parsed = new URL(url!);
    expect(parsed.host).toBe("cosmo-files-test.acct123.r2.cloudflarestorage.com");
    expect(parsed.pathname).toBe("/cmp1/files/brief-1234.psd");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(parsed.searchParams.get("response-content-disposition")).toBe('inline; filename="Brief v2.psd"');
  });

  it("keeps legacy Cloudinary and Blob URLs readable", async () => {
    const pub = "https://res.cloudinary.com/demo/video/upload/v1747/academy/c1/voice.webm";
    expect(fs.parseCloudinaryUrl(pub)).toMatchObject({ resourceType: "video", publicId: "academy/c1/voice" });
    expect(await fs.storedFileDeliveryUrl(pub)).toBe(pub);
    expect(fs.isLegacyBlobUrl("https://abc.private.blob.vercel-storage.com/x.png")).toBe(true);
    expect(await fs.storedFileDeliveryUrl("https://abc.private.blob.vercel-storage.com/x.png")).toBeNull();
  });

  it("caps files at 2GB", () => {
    expect(fs.storageSizeError(300 * 1024 * 1024)).toBeNull();
    expect(fs.storageSizeError(2_100_000_000)).toMatch(/2GB/);
  });
});
