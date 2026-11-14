import type { NewItemRequestStatusValue } from "@/lib/new-item-requests/types";

export type StatusChangeResult = { ok: "change" } | { ok: "noop" } | { ok: "reject" };

const TERMINAL_STATUSES: ReadonlySet<NewItemRequestStatusValue> = new Set([
  "already_have",
  "ordered",
  "closed",
]);

export function assertStatusChange(
  from: NewItemRequestStatusValue,
  to: NewItemRequestStatusValue,
): StatusChangeResult {
  if (from === to) return { ok: "noop" };
  if (from === "open" && TERMINAL_STATUSES.has(to)) {
    return { ok: "change" };
  }
  return { ok: "reject" };
}
