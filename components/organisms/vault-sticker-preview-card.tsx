import { cn } from "@/lib/utils";

interface VaultStickerPreviewCardProps {
  sku?: string | null;
  itemName?: string | null;
  supplierCode?: string | null;
  locationRef?: string | null;
  className?: string;
}

function cleanItemName(name: string | null | undefined): string {
  if (!name) return "-";
  return name.trim().replace(/\s*\(Default Title\)\s*$/i, "").trim() || "-";
}

export function VaultStickerPreviewCard({
  sku,
  itemName,
  supplierCode,
  locationRef,
  className,
}: VaultStickerPreviewCardProps) {
  const displayName = cleanItemName(itemName);
  return (
    <div
      style={{ fontFamily: '"Aptos", "Segoe UI", Arial, sans-serif' }}
      className={cn(
        "sticker-card relative h-[1in] w-[2in] overflow-hidden rounded-md border border-black/30 bg-yellow-300 p-2 text-black shadow-sm",
        className
      )}
    >
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        {/* SKU */}
        {sku?.trim() && (
          <div className="text-[10px] font-semibold leading-none tracking-wide">
            {sku.trim()}
          </div>
        )}
        {/* Item name */}
        <div className="text-[13px] font-bold leading-[1.15] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden px-1">
          {displayName}
        </div>

        {/* Supplier code and ref — centered under name */}
        <div className="flex items-center gap-4 text-[10px] font-semibold leading-none">
          {supplierCode?.trim() && <span>{supplierCode.trim()}</span>}
          {locationRef?.trim() && <span>{locationRef.trim()}</span>}
        </div>
      </div>
    </div>
  );
}
