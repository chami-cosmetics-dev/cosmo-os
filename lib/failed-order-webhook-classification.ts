export function normalizeFailedWebhookMessage(message: string) {
  return message.replace(/\s+/g, " ").trim();
}

export function classifyFailedWebhookError(message: string) {
  const normalized = normalizeFailedWebhookMessage(message).toLowerCase();

  if (
    normalized.startsWith("validation failed") ||
    normalized.startsWith("stored payload invalid")
  ) {
    return {
      type: "Payload validation",
      retryable: false,
    } as const;
  }

  if (normalized.includes("unique constraint")) {
    return {
      type: "Database constraint",
      retryable: false,
    } as const;
  }

  if (normalized.includes("foreign key constraint")) {
    return {
      type: "Database relation",
      retryable: false,
    } as const;
  }

  if (
    normalized.includes("invalid") ||
    normalized.includes("missing required") ||
    normalized.includes("required field") ||
    normalized.includes("not found")
  ) {
    return {
      type: "Invalid data",
      retryable: false,
    } as const;
  }

  return {
    type: "Processing error",
    retryable: true,
  } as const;
}
