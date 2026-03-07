"use client";

import { forwardRef } from "react";
import { Cropper, type CropperRef } from "react-advanced-cropper";

import "react-advanced-cropper/dist/style.css";

type CropperWithStylesProps = React.ComponentProps<typeof Cropper>;

export const CropperWithStyles = forwardRef<CropperRef, CropperWithStylesProps>(
  function CropperWithStyles(props, ref) {
    return <Cropper ref={ref} {...props} />;
  }
);
