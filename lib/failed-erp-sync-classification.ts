export function normalizeFailedErpSyncMessage(message: string) {
  return message.replace(/\s+/g, " ").trim();
}

function formatOutOfStockLabel(rawItem: string) {
  const item = rawItem.trim();
  const colonIdx = item.indexOf(":");
  const label =
    colonIdx >= 0 && colonIdx < item.length - 1
      ? item.slice(colonIdx + 1).trim()
      : item;
  return `Out of stock - ${label}`;
}

/** Turn raw ERPNext NegativeStockError payloads into a short operator-friendly message. */
export function formatFailedErpSyncErrorMessage(message: string) {
  const normalized = message.replace(/\\"/g, '"');
  if (!normalized.includes("NegativeStockError")) {
    return normalizeFailedErpSyncMessage(message);
  }

  const anchorMatch = normalized.match(/>\s*Item\s+([^<]+?)\s*<\s*\/?a>/i);
  if (anchorMatch?.[1]) {
    return formatOutOfStockLabel(anchorMatch[1]);
  }

  const plainMatch = normalized.match(
    /NegativeStockError:\s*[\d.]+\s*units?\s*of\s*(?:<[^>]+>\s*)?Item\s+([^<"\n]+)/i
  );
  if (plainMatch?.[1]) {
    return formatOutOfStockLabel(plainMatch[1]);
  }

  return "Out of stock - item unavailable in ERP warehouse";
}

export function classifyFailedErpSyncError(message: string) {
  const normalized = normalizeFailedErpSyncMessage(message).toLowerCase();

  if (
    normalized.includes("awaiting finance approval") ||
    normalized.includes("pending approval")
  ) {
    return {
      type: "Pending approval",
      retryable: false,
    } as const;
  }

  if (
    normalized.includes("negativestockerror") ||
    normalized.startsWith("out of stock -")
  ) {
    return {
      type: "Out of stock",
      retryable: false,
    } as const;
  }

  if (
    normalized.includes("item code") && normalized.includes("not found") ||
    normalized.includes("does not exist") && normalized.includes("item") ||
    normalized.includes("customer") && normalized.includes("not found") ||
    normalized.includes("mandatory field") ||
    normalized.includes("validation error")
  ) {
    return {
      type: "Invalid ERP data",
      retryable: false,
    } as const;
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound") ||
    normalized.includes("network") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504") ||
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("fetch failed")
  ) {
    return {
      type: "Transient network",
      retryable: true,
    } as const;
  }

  return {
    type: "ERP sync error",
    retryable: true,
  } as const;
}
