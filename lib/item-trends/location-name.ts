/** One warehouse label. `LWK - OGF` → `OGF`. */
export function displayWarehouseName(label: string): string {
  const trimmed = label.trim();
  const match = trimmed.match(/^[A-Za-z]{2,8}\s*[-–]\s*(.+)$/);
  const place = match?.[1]?.trim();
  return place || trimmed;
}
