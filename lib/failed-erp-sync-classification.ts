export function normalizeFailedErpSyncMessage(message: string) {
  return message.replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractErpNextMessage(message: string): string | null {
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return null;
  if (!/\[\d+\]:\s*$/.test(message.slice(0, jsonStart).trimEnd())) return null;
  try {
    const parsed = JSON.parse(message.slice(jsonStart)) as { exception?: string };
    if (!parsed.exception) return null;
    const text = parsed.exception.replace(/^[\w.]+(?:Error|Exception):\s*/i, "").trim();
    return stripHtml(text) || null;
  } catch {
    return null;
  }
}

export type OutOfStockItemInfo = {
  sku: string;
  itemName: string | null;
};

export type OutOfStockLineItemHint = {
  sku: string | null;
  productTitle: string | null;
  variantTitle?: string | null;
};

/** ERP / Vault item codes (e.g. CT028-1, NW005-1) — not full product titles. */
export function looksLikeItemSku(value: string): boolean {
  const v = value.trim();
  if (!v || v.includes(" ")) return false;
  return /^[A-Z]{1,4}\d{2,4}-\d+$/i.test(v) || /^[A-Z0-9][A-Z0-9._-]{0,30}$/i.test(v);
}

function splitSkuAndItemName(rawItem: string): OutOfStockItemInfo {
  const item = rawItem.trim();
  const colonIdx = item.indexOf(":");
  if (colonIdx > 0) {
    const skuPart = item.slice(0, colonIdx).trim().replace(/^item\s+/i, "");
    const namePart = item.slice(colonIdx + 1).trim() || null;
    if (looksLikeItemSku(skuPart)) {
      return { sku: skuPart, itemName: namePart };
    }
    return { sku: skuPart, itemName: namePart };
  }
  if (looksLikeItemSku(item)) {
    return { sku: item, itemName: null };
  }
  return { sku: "", itemName: item };
}

function findLineItemByTitle(
  lineItems: OutOfStockLineItemHint[],
  itemName: string | null | undefined,
): OutOfStockLineItemHint | null {
  if (!itemName?.trim()) return null;
  const target = itemName.trim().toLowerCase();
  for (const li of lineItems) {
    const title = li.productTitle?.trim() ?? "";
    const full = [li.productTitle, li.variantTitle].filter(Boolean).join(" ").trim();
    const candidates = [title, full].filter(Boolean).map((s) => s.toLowerCase());
    if (candidates.some((c) => c === target || c.includes(target) || target.includes(c))) {
      return li;
    }
  }
  return lineItems.length === 1 ? lineItems[0]! : null;
}

export function resolveOutOfStockItemFromError(
  message: string,
  lineItems: OutOfStockLineItemHint[] = [],
): OutOfStockItemInfo | null {
  const parsed =
    parseOutOfStockItemFromError(message) ??
    parseOutOfStockItemFromError(formatFailedErpSyncErrorMessage(message));
  if (!parsed) return null;

  if (parsed.sku && looksLikeItemSku(parsed.sku)) {
    return { sku: parsed.sku, itemName: parsed.itemName };
  }

  const itemName = parsed.itemName ?? (parsed.sku || null);
  const matched = findLineItemByTitle(lineItems, itemName);
  if (matched?.sku?.trim()) {
    return {
      sku: matched.sku.trim(),
      itemName: itemName ?? matched.productTitle,
    };
  }

  if (parsed.sku && looksLikeItemSku(parsed.sku)) {
    return parsed;
  }

  return null;
}

export function formatOutOfStockLabel(info: OutOfStockItemInfo) {
  if (info.sku && looksLikeItemSku(info.sku)) {
    if (info.itemName) {
      return `Out of stock - ${info.sku} (${info.itemName})`;
    }
    return `Out of stock - ${info.sku}`;
  }
  if (info.itemName) {
    return `Out of stock - ${info.itemName}`;
  }
  return `Out of stock - ${info.sku}`;
}

/** Extract SKU and item name from a raw or formatted ERP out-of-stock error. */
export function parseOutOfStockItemFromError(message: string): OutOfStockItemInfo | null {
  const normalized = message.replace(/\\"/g, '"');

  const hrefSkuMatch = normalized.match(/\/app\/(?:Form\/)?Item\/([^"\\>\s]+)/i);
  if (hrefSkuMatch?.[1]?.trim()) {
    const sku = hrefSkuMatch[1].trim();
    const anchorMatch = normalized.match(/>\s*Item\s+([^<]+?)\s*<\s*\/?a>/i);
    if (anchorMatch?.[1]) {
      const split = splitSkuAndItemName(anchorMatch[1]);
      if (looksLikeItemSku(split.sku)) {
        return { sku: split.sku, itemName: split.itemName };
      }
    }
    return { sku, itemName: null };
  }

  const formattedMatch = normalized.match(/^Out of stock -\s*(.+)$/i);
  if (formattedMatch?.[1]) {
    const tail = formattedMatch[1].trim();
    const parenMatch = tail.match(/^([^(]+)\((.+)\)$/);
    if (parenMatch) {
      const skuPart = parenMatch[1].trim();
      const itemPart = parenMatch[2].trim() || null;
      if (looksLikeItemSku(skuPart)) {
        return { sku: skuPart, itemName: itemPart };
      }
      return { sku: "", itemName: itemPart ?? skuPart };
    }
    const colonSplit = splitSkuAndItemName(tail);
    if (looksLikeItemSku(colonSplit.sku)) {
      return colonSplit;
    }
    return { sku: "", itemName: tail };
  }

  const anchorMatch = normalized.match(/>\s*Item\s+([^<]+?)\s*<\s*\/?a>/i);
  if (anchorMatch?.[1]) {
    const split = splitSkuAndItemName(anchorMatch[1]);
    if (split.sku && looksLikeItemSku(split.sku)) return split;
    if (split.itemName) return { sku: "", itemName: split.itemName };
    return split.sku ? split : null;
  }

  const plainMatch = normalized.match(
    /NegativeStockError:\s*[\d.]+\s*units?\s*of\s*(?:<[^>]+>\s*)?Item\s+([^<"\n]+)/i,
  );
  if (plainMatch?.[1]) {
    const split = splitSkuAndItemName(plainMatch[1]);
    if (split.sku && looksLikeItemSku(split.sku)) return split;
    if (split.itemName) return { sku: "", itemName: split.itemName };
    return split.sku ? split : null;
  }

  return null;
}

export function isErpOutOfStockSyncError(message: string | null | undefined) {
  if (!message?.trim()) return false;
  return classifyFailedErpSyncError(message).type === "Out of stock";
}

/** Turn raw ERPNext error payloads into a short operator-friendly message. */
export function formatFailedErpSyncErrorMessage(message: string) {
  const normalized = message.replace(/\\"/g, '"');
  if (!normalized.includes("NegativeStockError")) {
    const parsed = parseOutOfStockItemFromError(message);
    if (parsed?.sku && looksLikeItemSku(parsed.sku)) return formatOutOfStockLabel(parsed);
    if (parsed?.itemName) return formatOutOfStockLabel({ sku: "", itemName: parsed.itemName });
    const extracted = extractErpNextMessage(message);
    if (extracted) return extracted;
    return normalizeFailedErpSyncMessage(message);
  }

  const parsed = parseOutOfStockItemFromError(normalized);
  if (parsed?.sku && looksLikeItemSku(parsed.sku)) return formatOutOfStockLabel(parsed);
  if (parsed?.itemName) return formatOutOfStockLabel({ sku: parsed.itemName, itemName: null });

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
