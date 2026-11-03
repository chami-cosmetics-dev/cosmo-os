export type MapOrigin = { latitude: number; longitude: number };

/** Ordered map/navigation URL candidates for a street address (pure — no RN imports). */
export function buildMapUrlCandidates(address: string, origin?: MapOrigin | null): string[] {
  const q = encodeURIComponent(address.trim());
  const originParam =
    origin && Number.isFinite(origin.latitude) && Number.isFinite(origin.longitude)
      ? `${origin.latitude},${origin.longitude}`
      : null;

  if (originParam) {
    return [
      `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originParam)}&destination=${q}`,
      `https://maps.apple.com/?saddr=${encodeURIComponent(originParam)}&daddr=${q}`,
      `geo:0,0?q=${q}`,
      `https://www.google.com/maps/search/?api=1&query=${q}`,
    ];
  }

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
