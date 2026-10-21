import type { NewItemRequestStatusValue } from "@/lib/new-item-requests/types";

export type StatusChangeResult = { ok: "change" } | { ok: "noop" } | { ok: "reject" };

export function assertStatusChange(
  from: NewItemRequestStatusValue,
  to: NewItemRequestStatusValue,
): StatusChangeResult {
  if (from === to) return { ok: "noop" };
  if (from === "open" && (to === "already_have" || to === "closed")) {
    return { ok: "change" };
  }
  return { ok: "reject" };
}
