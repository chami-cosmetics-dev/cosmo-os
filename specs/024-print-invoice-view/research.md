# Research: Print Invoice Without Marking Printed

## 1. How “marked printed” works today

**Decision**: Treat “marked printed” as any successful `GET .../invoice?print=1` (or `print=true`) that runs the mutate block in `app/api/admin/orders/[id]/invoice/route.ts`.

**Rationale**: That path increments `printCount`, sets `lastPrintedAt` / `lastPrintedById`, and may advance fulfillment stage (`order_received` / `sample_free_issue` → `print`, or `print` → `ready_to_dispatch`). The invoice timeline “Print / Printed” step is derived from `printCount` / `lastPrintedAt` (and related stage), so avoiding that mutate block satisfies FR-003/FR-004.

**Alternatives considered**:
- Client-only “don’t refresh” after `print=1` — rejected; server still mutates before HTML returns.
- Separate PDF microservice — rejected; violates simplicity; existing HTML print format is the product standard.

## 2. View-only print mode on existing invoice GET

**Decision**: Add/document an explicit **view-only print** query mode that:
1. Requires `fulfillment.order_print.read` (same as plain invoice GET today).
2. Sets template `print.autoPrint` so the browser print dialog can open.
3. **Never** increments print count or updates stage / last-printed fields.

Preferred query shape: `?preview=1` (clearer than overloading `print=`). If implementing with minimal code, `?print=preview` already yields `shouldIncrementPrint === false` and `autoPrint === true` because increment only checks `"1"` / `"true"` while `autoPrint` is `Boolean(printParam)`. Prefer an explicit `preview` param (or both accepted) so intent is readable in UI and contracts.

**Rationale**: Reuses `renderPrintFormatHtml` and location default print format; no duplicate layout; matches Constitution V.

**Alternatives considered**:
- New `/invoice/preview` route — rejected; duplicate auth/load/render.
- Always open without autoPrint and rely on user Ctrl+P — weaker UX vs FR-002 / SC-002.

## 3. Order details UI entry point

**Decision**: Primary surface is `OrderInvoiceViewModal` (“Invoice timeline - view only”). Change **Print Invoice** to open the view-only URL. Show the button whenever the user may view the printable invoice (at least `fulfillment.order_print.read` / equivalent prop), **including** `printCount === 0` and cancelled orders — not only when `canPrint && printCount > 0`.

**Rationale**: Today’s button is gated on `canPrint && printCount > 0` and opens `?print=1`, so unprinted orders (user’s screenshot) have no safe print, and reprints from the modal still mutate. Spec requires both availability and no status change.

**Alternatives considered**:
- Keep `print=1` for reprints only — rejected; FR-003 says Print Invoice must never mark printed.
- Put control only under collapsed Order Details — acceptable secondary placement; actions row next to View JSON is discoverable enough for P2.

## 4. Formal print path unchanged

**Decision**: Leave fulfillment Print queue / bulk print on `?print=1` + `fulfillment.order_print.print`. Do not change that behavior in this feature.

**Rationale**: FR-008 — formal mark-as-printed must remain. Spec scopes the new behavior to order details Print Invoice.

**Audit note**: `order-fulfillment-detail.tsx` also opens `?print=1`. During implementation, confirm whether that control is formal print or a view-only details action; if view-only, switch it to preview mode for consistency.

## 5. Permissions

**Decision**: View-only Print Invoice uses **read** permission (`fulfillment.order_print.read`). Formal print keeps **print** permission.

**Rationale**: Matches existing invoice GET branching; aligns with spec assumption that viewers of order details can print a copy without needing the status-changing print permission. If a parent page already opens the modal without print read, either hide the button or pass a dedicated `canViewInvoice` / `canPrintInvoiceView` prop derived from the same permission used to call the invoice API.

## 6. Errors and cancelled / blocked orders

**Decision**: Keep existing invoice failures (401/404/400/409 finance-payment block). On failure, show existing browser error page or improve with a toast if open fails — status must remain unchanged (already true if request fails before/without mutate). Cancelled orders are printable if GET succeeds; no special cancel exception required unless finance block returns 409 — document in quickstart as known constraint.

**Rationale**: Spec edge cases; no need to invent a parallel error channel for v1.

## 7. Refresh after print

**Decision**: For view-only Print Invoice, do **not** call `onRefresh` after a timeout (current modal waits 2s after `print=1` to reload mutated print fields). Optional refresh is harmless but unnecessary and implies mutation.

**Rationale**: Avoid misleading UX; FR-003.

## 8. Agent context script

**Decision**: Skip — this repo’s `.specify` integration has no `update-agent-context` / equivalent script under `.specify/scripts`.

**Rationale**: Skill step cannot run; feature.json + plan artifacts are sufficient for downstream `/speckit-tasks`.
