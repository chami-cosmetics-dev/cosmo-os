import { cn } from "@/lib/utils";

interface StickerPreviewCardProps {
  manufactureDate?: string | null;
  expireDate?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  locationReference?: string | null;
  supplierName?: string | null;
  unitPrice?: string | number | null;
  companyName?: string | null;
  locationAddress?: string | null;
  companyAddress?: string | null;
  locationPhone?: string | null;
  className?: string;
}

function parseDDMMYYYY(value: string) {
  const parts = value.split("/");
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    return null;
  }
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDateValue(value?: string | null) {
  const raw = value?.trim() ?? "";
  if (!raw) return "-";
  const ddmmyyyy = parseDDMMYYYY(raw);
  if (ddmmyyyy) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatPriceValue(value?: string | number | null) {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getLocationRefNumber(locationReference?: string | null) {
  const raw = locationReference?.trim() ?? "";
  if (!raw) return "-";
  const digits = raw.replace(/\D/g, "");
  return digits || "-";
}

export function StickerPreviewCard({
  manufactureDate,
  expireDate,
  itemCode,
  itemName,
  locationReference,
  supplierName,
  unitPrice,
  companyName,
  locationAddress,
  companyAddress,
  locationPhone,
  className,
}: StickerPreviewCardProps) {
  return (
    <div
      className={cn(
        "sticker-card h-[1in] w-[2in] overflow-hidden rounded-md border border-black/30 bg-lime-300 p-2 text-black shadow-sm",
        className
      )}
    >
      <div className="mb-0.5 text-center text-[8px] font-extrabold leading-[1.05] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
        {itemName?.trim() || "-"}
      </div>
      <div className="flex items-start justify-between text-[7px] leading-[1.05]">
        <div className="font-bold">
          <div>
            <span>MFD:</span> {formatDateValue(manufactureDate)}
          </div>
          <div>
            <span>EXP:</span> {formatDateValue(expireDate)}
          </div>
          <div>
            <span>Code:</span> {itemCode?.trim() || "-"}
          </div>
          <div>
            <span>Ref:</span> {getLocationRefNumber(locationReference)}
          </div>
        </div>
        <div className="max-w-[0.72in] text-right">
          <div className="truncate text-[7px] font-extrabold">
            {supplierName?.trim() || "-"}
          </div>
          <div className="mt-0.5 text-[11px] font-extrabold leading-none">
            MRP
          </div>
          <div className="text-[14px] font-extrabold leading-none">
            {formatPriceValue(unitPrice)}
          </div>
        </div>
      </div>

      <div className="mt-0 text-center text-[8px] font-extrabold uppercase leading-none">
        {companyName?.trim() || "COMPANY"}
      </div>

      <div className="mt-0 text-center text-[7px] font-bold leading-none uppercase truncate">
        {locationAddress?.trim() || companyAddress?.trim() || "-"}
      </div>
      <div className="mt-0.5 text-center text-[7px] font-bold leading-none">
        TP: {locationPhone?.trim() || "-"}
      </div>
    </div>
  );
}
