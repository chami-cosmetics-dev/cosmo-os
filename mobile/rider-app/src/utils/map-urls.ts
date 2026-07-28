/** Ordered map/navigation URL candidates for a street address (pure — no RN imports). */
export function buildMapUrlCandidates(address: string): string[] {
  const q = encodeURIComponent(address.trim());
  return [
    `geo:0,0?q=${q}`,
    `https://www.google.com/maps/search/?api=1&query=${q}`,
    `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    `https://maps.apple.com/?q=${q}`,
  ];
}

export function hasUsableAddress(address: string) {
  return Boolean(address?.trim()) && address !== "No address";
}
