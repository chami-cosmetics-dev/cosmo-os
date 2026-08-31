export function displayManualCount(input: {
  combined: boolean;
  hasLanes: boolean;
  myQuantity: number | null;
  combinedQuantity: number | null;
  legacyCount: number | null;
}): number | null {
  if (input.combined) return input.combinedQuantity ?? input.legacyCount;
  if (input.hasLanes) return input.myQuantity;
  return input.legacyCount;
}

export function allCountersSaved(
  counterUserIds: string[],
  savedUserIds: string[],
) {
  if (counterUserIds.length === 0) return false;
  const saved = new Set(savedUserIds);
  return counterUserIds.every((id) => saved.has(id));
}
