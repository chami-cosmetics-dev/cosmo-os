"use client";

import { useRef, useState } from "react";
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
import { CloudinaryLogo } from "@/components/molecules/cloudinary-logo";
import { notify } from "@/lib/notify";

interface LogoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  uploadType: "company" | "location" | "favicon";
  locationId?: string;
  disabled?: boolean;
  label?: string;
}

export function LogoUpload({
  value,
  onChange,
  uploadType,
  locationId,
  disabled = false,
  label = "Logo",
}: LogoUploadProps) {
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
      formData.append("file", blob, "logo.png");
      formData.append("type", uploadType);
      if (uploadType === "location" && locationId) {
        formData.append("locationId", locationId);
      }
      // favicon and company don't need locationId

      const res = await fetch("/api/admin/settings/upload-logo", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to upload logo");
        return;
      }

      if (data.url) {
        onChange(data.url);
        notify.success("Logo uploaded.");
      }
    } catch {
      notify.error("Failed to upload logo");
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

  function handleRemove() {
    onChange(null);
  }

  const isBusy = disabled || uploading;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-start gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {value ? (
            <CloudinaryLogo
              src={value}
              alt="Logo"
              width={80}
              height={80}
              className="size-full object-contain"
            />
          ) : (
            <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
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
            <DialogTitle>Crop logo</DialogTitle>
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
                  Uploading...
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
