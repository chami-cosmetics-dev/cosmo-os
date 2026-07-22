/** Strip catalog "(Default Title)" suffixes from sticker item names. */
export function cleanStickerItemName(name: string | null | undefined): string {
  if (!name) return "-";
  const cleaned = name
    .trim()
    .replace(/\s*\(\s*Default Title\s*\)\s*$/i, "")
    .trim();
  return cleaned || "-";
}
