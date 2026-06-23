export function normalizeFailedErpSyncMessage(message: string) {
  return message.replace(/\s+/g, " ").trim();
}

export type OutOfStockItemInfo = {
  sku: string;
  itemName: string | null;
};

function splitSkuAndItemName(rawItem: string): OutOfStockItemInfo {
  const item = rawItem.trim();
  const colonIdx = item.indexOf(":");
  if (colonIdx > 0) {
    return {
      sku: item.slice(0, colonIdx).trim(),
      itemName: item.slice(colonIdx + 1).trim() || null,
    };
  }
  return { sku: item, itemName: null };
}

export function formatOutOfStockLabel(info: OutOfStockItemInfo) {
  if (info.itemName) {
    return `Out of stock - ${info.sku} (${info.itemName})`;
  }
  return `Out of stock - ${info.sku}`;
}

/** Extract SKU and item name from a raw or formatted ERP out-of-stock error. */
export function parseOutOfStockItemFromError(message: string): OutOfStockItemInfo | null {
  const normalized = message.replace(/\\"/g, '"');

  const formattedMatch = normalized.match(/^Out of stock -\s*(.+)$/i);
  if (formattedMatch?.[1]) {
    const tail = formattedMatch[1].trim();
    const parenMatch = tail.match(/^([^(]+)\((.+)\)$/);
    if (parenMatch) {
      return {
        sku: parenMatch[1].trim(),
        itemName: parenMatch[2].trim() || null,
      };
    }
    return splitSkuAndItemName(tail);
  }

  const anchorMatch = normalized.match(/>\s*Item\s+([^<]+?)\s*<\s*\/?a>/i);
  if (anchorMatch?.[1]) {
    return splitSkuAndItemName(anchorMatch[1]);
  }

  const plainMatch = normalized.match(
    /NegativeStockError:\s*[\d.]+\s*units?\s*of\s*(?:<[^>]+>\s*)?Item\s+([^<"\n]+)/i,
  );
  if (plainMatch?.[1]) {
    return splitSkuAndItemName(plainMatch[1]);
  }

  return null;
}

export function isErpOutOfStockSyncError(message: string | null | undefined) {
  if (!message?.trim()) return false;
  return classifyFailedErpSyncError(message).type === "Out of stock";
}

/** Turn raw ERPNext NegativeStockError payloads into a short operator-friendly message. */
export function formatFailedErpSyncErrorMessage(message: string) {
  const normalized = message.replace(/\\"/g, '"');
  if (!normalized.includes("NegativeStockError")) {
    const parsed = parseOutOfStockItemFromError(message);
    if (parsed) return formatOutOfStockLabel(parsed);
    return normalizeFailedErpSyncMessage(message);
  }

  const parsed = parseOutOfStockItemFromError(normalized);
  if (parsed) return formatOutOfStockLabel(parsed);

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
