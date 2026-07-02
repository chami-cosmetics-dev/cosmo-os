"use client";

import { upload } from "@vercel/blob/client";
import { Copy, FileIcon, FileImage, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { notify } from "@/lib/notify";

type StoredFile = {
  id: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  provider: string;
  url: string;
  createdAt: string;
  uploadedBy: { id: string; name: string | null } | null;
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(file: StoredFile) {
  return file.mimeType?.startsWith("image/") ?? false;
}

export function FilesSettingsForm() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function fetchFiles() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings/files");
      const data = (await res.json()) as { files?: StoredFile[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load files");
      setFiles(data.files ?? []);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchFiles();
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: "private",
        handleUploadUrl: "/api/admin/settings/files/upload",
      });

      const res = await fetch("/api/admin/settings/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          blobUrl: blob.url,
          fileSize: file.size,
          mimeType: file.type || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save file");
      notify.success(`${file.name} uploaded.`);
      await fetchFiles();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function deleteFile(file: StoredFile) {
    setDeletingId(file.id);
    try {
      const res = await fetch(`/api/admin/settings/files/${file.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete file");
      notify.success(`${file.fileName} deleted.`);
      await fetchFiles();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function copyUrl(url: string) {
    const absolute = `${window.location.origin}${url}`;
    await navigator.clipboard.writeText(absolute);
    notify.success("File URL copied.");
  }

  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50">
        <CardTitle>Files</CardTitle>
        <CardDescription>Upload files for print formats and future company assets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
          <p className="text-sm text-muted-foreground">Use copied URLs inside custom print-format HTML.</p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload file
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 py-16 text-center text-sm text-muted-foreground">
            No files uploaded yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {files.map((file) => (
              <div key={file.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-start gap-3">
                  {isImage(file) ? (
                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                      <img src={file.url} alt={file.fileName} className="size-12 rounded-md object-cover ring-1 ring-border/60" />
                    </a>
                  ) : (
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="flex size-12 items-center justify-center rounded-md bg-secondary/30">
                      {file.mimeType?.startsWith("image/") ? <FileImage className="size-5" /> : <FileIcon className="size-5" />}
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:underline">
                      {file.fileName}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(file.fileSize)} | {file.mimeType ?? "unknown"}
                    </p>
                    <code className="mt-2 block truncate rounded bg-secondary/40 px-2 py-1 text-xs">{file.url}</code>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyUrl(file.url)} className="gap-1.5">
                    <Copy className="size-3.5" />
                    Copy URL
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={deletingId === file.id}
                    onClick={() => void deleteFile(file)}
                  >
                    {deletingId === file.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
