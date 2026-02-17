"use client";

import { CldImage } from "next-cloudinary";

interface CloudinaryLogoProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Renders a Cloudinary logo with optimized delivery (auto-format, auto-quality).
 * Falls back to img if CldImage is not configured or src is not a Cloudinary URL.
 */
export function CloudinaryLogo({
  src,
  alt,
  width = 80,
  height = 80,
  className,
}: CloudinaryLogoProps) {
  const isCloudinaryUrl = src.startsWith("https://res.cloudinary.com/");

  if (!isCloudinaryUrl || !process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
      />
    );
  }

  return (
    <CldImage
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      crop={{ type: "fit" }}
    />
  );
}
