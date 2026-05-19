"use client";

import { upload } from "@vercel/blob/client";
import {
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify } from "@/lib/notify";

type AssetType = "image" | "video" | "audio" | "document";

type Asset = {
  id: string;
  sku: string;
  type: string;
  fileName: string;
  blobUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  provider: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string | null } | null;
};

const TABS: { key: AssetType; label: string; accept: string }[] = [
  { key: "image", label: "Photos", accept: "image/jpeg,image/png,image/webp,image/gif" },
  { key: "video", label: "Videos", accept: "video/mp4,video/quicktime,video/webm" },
  { key: "audio", label: "Audio", accept: "audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/webm,audio/ogg" },
  {
    key: "document",
    label: "Documents",
    accept: "image/vnd.adobe.photoshop,application/pdf,application/octet-stream",
  },
];

function mimeToType(mime: string): AssetType {
  if (mime.startsWith("image/") && mime !== "image/vnd.adobe.photoshop") return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function proxyUrl(asset: Asset) {
  return `/api/admin/product-items/assets/${asset.id}`;
}

function AssetIcon({ type }: { type: string }) {
  if (type === "image") return <FileImage className="size-5 text-sky-500" />;
  if (type === "video") return <FileVideo className="size-5 text-violet-500" />;
  if (type === "audio") return <FileAudio className="size-5 text-amber-500" />;
  return <FileText className="size-5 text-rose-400" />;
}

interface ProductItemStorageSheetProps {
  open: boolean;
  sku: string | null;
  productTitle: string | null;
  familyName: string | null;
  onClose: () => void;
}

export function ProductItemStorageSheet({
  open,
  sku,
  productTitle,
  familyName,
  onClose,
}: ProductItemStorageSheetProps) {
  const [activeTab, setActiveTab] = useState<AssetType>("image");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAssets = useCallback(async (family: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/product-items/assets?familyName=${encodeURIComponent(family)}`);
      const data = (await res.json()) as { assets?: Asset[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load assets");
      setAssets(data.assets ?? []);
    } catch {
      notify.error("Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && familyName) {
      setAssets([]);
      setActiveTab("image");
      void fetchAssets(familyName);
    }
  }, [open, familyName, fetchAssets]);

  async function handleUpload(file: File) {
    if (!sku || !familyName) return;
    const type = mimeToType(file.type || "application/octet-stream");
    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: "private",
        handleUploadUrl: "/api/admin/product-items/assets/upload",
        clientPayload: JSON.stringify({ sku }),
      });

      const res = await fetch("/api/admin/product-items/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          productTitle: productTitle ?? "",
          type,
          fileName: file.name,
          blobUrl: blob.url,
          fileSize: file.size,
          mimeType: file.type || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save asset");

      notify.success(`${file.name} uploaded.`);
      await fetchAssets(familyName);
      setActiveTab(type);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(asset: Asset) {
    setDeletingId(asset.id);
    try {
      const res = await fetch(`/api/admin/product-items/assets/${asset.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete");
      }
      notify.success(`${asset.fileName} deleted.`);
      if (familyName) await fetchAssets(familyName);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const currentTab = TABS.find((t) => t.key === activeTab)!;
  const tabAssets = assets.filter((a) => a.type === activeTab);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl" side="right">
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <SheetTitle className="text-base font-semibold">
            {familyName ?? productTitle ?? sku ?? "Item Storage"}
          </SheetTitle>
          {sku ? (
            <p className="text-xs text-muted-foreground">SKU {sku} · Family storage</p>
          ) : null}
        </SheetHeader>

        {/* Tabs */}
        <div className="flex border-b border-border/60">
          {TABS.map((tab) => {
            const count = assets.filter((a) => a.type === tab.key).length;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {count > 0 ? (
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : tabAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 py-16 text-center">
              <AssetIcon type={activeTab} />
              <p className="text-sm text-muted-foreground">No {currentTab.label.toLowerCase()} yet</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Upload
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {tabAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-lg border border-border/60 bg-background p-3"
                >
                  <div className="flex items-start gap-3">
                    {/* Preview / icon */}
                    {asset.type === "image" ? (
                      <a href={proxyUrl(asset)} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <img
                          src={proxyUrl(asset)}
                          alt={asset.fileName}
                          className="size-12 rounded-md object-cover ring-1 ring-border/50"
                        />
                      </a>
                    ) : (
                      <a
                        href={proxyUrl(asset)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex size-12 shrink-0 items-center justify-center rounded-md bg-secondary/30"
                      >
                        <AssetIcon type={asset.type} />
                      </a>
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <a
                        href={proxyUrl(asset)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {asset.fileName}
                      </a>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[formatBytes(asset.fileSize), asset.uploadedBy?.name]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    {/* Delete */}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={deletingId === asset.id}
                      onClick={() => handleDelete(asset)}
                    >
                      {deletingId === asset.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>

                  {/* Audio player */}
                  {asset.type === "audio" && (
                    <audio
                      src={proxyUrl(asset)}
                      controls
                      className="mt-3 w-full"
                    />
                  )}

                  {/* Video player */}
                  {asset.type === "video" && (
                    <video
                      src={proxyUrl(asset)}
                      controls
                      className="mt-3 w-full rounded-md"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer upload */}
        {tabAssets.length > 0 ? (
          <div className="border-t border-border/60 px-5 py-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={currentTab.accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full border-border/70"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {uploading ? "Uploading..." : `Upload ${currentTab.label}`}
            </Button>
          </div>
        ) : null}

        {/* Hidden input when empty state shows its own button */}
        {tabAssets.length === 0 ? (
          <input
            ref={fileInputRef}
            type="file"
            accept={currentTab.accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
