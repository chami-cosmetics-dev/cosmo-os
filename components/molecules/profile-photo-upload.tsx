"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cropper, type CropperRef } from "react-advanced-cropper";
import { ImageIcon, Loader2, RotateCw, FlipHorizontal, FlipVertical, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify } from "@/lib/notify";

interface ProfilePhotoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function ProfilePhotoUpload({
  value,
  onChange,
  disabled = false,
}: ProfilePhotoUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<CropperRef>(null);
  const [uploading, setUploading] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImageToCrop(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleCropConfirm() {
    const canvas = cropperRef.current?.getCanvas();
    if (!canvas) return;

    setUploading(true);
    setCropOpen(false);

    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png", 0.92);
      });

      if (!blob) {
        notify.error("Failed to create image");
        return;
      }

      const formData = new FormData();
      formData.append("file", blob, "profile.png");

      const res = await fetch("/api/profile/upload-photo", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to upload photo");
        return;
      }

      if (data.url) {
        onChange(data.url);
        notify.success("Profile photo uploaded.");
        router.refresh();
      }
    } catch {
      notify.error("Failed to upload photo");
    } finally {
      setUploading(false);
      setImageToCrop(null);
    }
  }

  function handleRotate() {
    cropperRef.current?.rotateImage(90);
  }

  function handleFlipHorizontal() {
    cropperRef.current?.flipImage(true, false);
  }

  function handleFlipVertical() {
    cropperRef.current?.flipImage(false, true);
  }

  function handleCropCancel() {
    setCropOpen(false);
    setImageToCrop(null);
  }

  async function handleRemove() {
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profilePhotoUrl: null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to remove photo");
        return;
      }
      onChange(null);
      notify.success("Profile photo removed.");
      router.refresh();
    } catch {
      notify.error("Failed to remove photo");
    }
  }

  const isBusy = disabled || uploading;
  const displayUrl = value ?? undefined;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Profile photo</label>
      <div className="flex items-start gap-4">
        <div className="flex size-20 shrink-0 overflow-hidden rounded-full border bg-muted">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Profile"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileChange}
              disabled={isBusy}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isBusy}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Uploading...
                </>
              ) : (
                "Upload"
              )}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={isBusy}
              >
                <X className="size-4" aria-hidden />
                Remove
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            JPEG, PNG, GIF or WebP. Max 5MB. Crop before upload.
          </p>
        </div>
      </div>

      <Dialog open={cropOpen} onOpenChange={(open) => !open && handleCropCancel()}>
        <DialogContent
          className="max-h-[90vh] max-w-[min(90vw,500px)] overflow-hidden p-0 data-[state=closed]:scale-100 data-[state=open]:scale-100"
          showCloseButton={true}
        >
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Crop profile photo</DialogTitle>
          </DialogHeader>
          <div className="relative h-[400px] w-full shrink-0 overflow-hidden bg-muted">
            {imageToCrop && (
              <Cropper
                ref={cropperRef}
                src={imageToCrop}
                className="cropper h-full w-full"
                stencilProps={{
                  grid: true,
                }}
                checkOrientation={true}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2 px-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRotate}
              title="Rotate 90°"
            >
              <RotateCw className="size-4" aria-hidden />
              Rotate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFlipHorizontal}
              title="Flip horizontal"
            >
              <FlipHorizontal className="size-4" aria-hidden />
              Flip H
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFlipVertical}
              title="Flip vertical"
            >
              <FlipVertical className="size-4" aria-hidden />
              Flip V
            </Button>
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" onClick={handleCropCancel}>
              Cancel
            </Button>
            <Button onClick={handleCropConfirm} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Upload
                </>
              ) : (
                "Upload"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
