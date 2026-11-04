/** ERP webhook body is either the doc or `{ data: doc }`. */
export function unwrapErpWebhookPayload(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const top = rawPayload as Record<string, unknown>;
  if (top.data != null && typeof top.data === "object" && !Array.isArray(top.data)) {
    return top.data as Record<string, unknown>;
  }
  return top;
}
