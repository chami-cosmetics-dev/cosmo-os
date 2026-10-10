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

/** Short ERPNext validation text from a thrown client error. */
export function erpErrorMessage(error: unknown): string {
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
