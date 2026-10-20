function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageFromServerMessages(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list) || list.length === 0) return null;
    const first = list[0];
    const parsed = typeof first === "string" ? (JSON.parse(first) as { message?: unknown }) : first;
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const message = stripHtml(String((parsed as { message?: unknown }).message ?? ""));
      return message || null;
    }
  } catch {
    return null;
  }
  return null;
}

const TRANSIENT_SOCKET_CODES = new Set([
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
]);

function errorCause(error: unknown): { code: string; message: string } {
  const cause = error instanceof Error ? error.cause : undefined;
  if (!cause || typeof cause !== "object") return { code: "", message: "" };
  const code = "code" in cause ? String((cause as { code?: unknown }).code ?? "") : "";
  const message = cause instanceof Error ? cause.message : "";
  return { code, message };
}

/** Dead keep-alive socket, gateway timeout, or rate limit. Safe to retry on GET only. */
export function isTransientErpFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const cause = errorCause(error);
  if (/fetch failed/i.test(message) || /other side closed/i.test(cause.message)) return true;
  if (TRANSIENT_SOCKET_CODES.has(cause.code)) return true;
  return /\[50[234]\]|\[429\]/.test(message);
}

/** Short ERPNext validation text from a thrown client error. */
export function erpErrorMessage(error: unknown): string {
  if (isTransientErpFetchError(error) && /fetch failed|other side closed/i.test(
    `${error instanceof Error ? error.message : String(error)} ${errorCause(error).message}`,
  )) {
    return "ERP connection closed before a response. Try again.";
  }
  const raw = error instanceof Error ? error.message : String(error);
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const body = JSON.parse(raw.slice(jsonStart)) as {
        message?: unknown;
        _server_messages?: unknown;
        exception?: unknown;
      };
      const fromServer = messageFromServerMessages(body._server_messages);
      if (fromServer) return fromServer.slice(0, 400);
      if (typeof body.message === "string") {
        const message = stripHtml(body.message);
        if (message && message !== "ValidationError") return message.slice(0, 400);
      }
      if (typeof body.exception === "string" && body.exception.trim()) {
        const exception = stripHtml(body.exception);
        const tail = exception.split(":").pop()?.trim() || exception;
        if (tail) return tail.slice(0, 400);
      }
    } catch {
      // Fall through to the raw text.
    }
  }
  return raw.replace(/^ERPNext\s+\w+\s+\S+\s+\[\d+\]:\s*/, "").slice(0, 400);
}
