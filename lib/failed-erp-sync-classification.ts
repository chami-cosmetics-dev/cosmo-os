export function normalizeFailedErpSyncMessage(message: string) {
  return message.replace(/\s+/g, " ").trim();
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
