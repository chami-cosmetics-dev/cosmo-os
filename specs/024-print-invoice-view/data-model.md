# Data Model: Print Invoice Without Marking Printed

No new entities or migrations. This feature only changes **how** the existing `Order` print fields are (not) updated when opening an invoice from order details.

## Existing entity: Order (relevant fields)

| Field | Role today | View-only Print Invoice | Formal `?print=1` |
|-------|------------|-------------------------|-------------------|
| `printCount` | > 0 ⇒ considered printed / timeline Print done | **Unchanged** | Incremented by 1 |
| `lastPrintedAt` | Timestamp of last formal print | **Unchanged** | Set to now |
| `lastPrintedById` | User who last formally printed | **Unchanged** | Set to current user |
| `fulfillmentStage` | Pipeline stage (may move on formal print) | **Unchanged** | May advance per existing rules |
| `packageReadyAt` / `packageReadyById` | Cleared in some formal print transitions | **Unchanged** | May clear when leaving `print` stage |

## Derived UI state (invoice timeline)

- **Print / Printed step**: Driven by `printCount`, `lastPrintedAt`, `lastPrintedBy`, and whether stage is at/past print — see `order-invoice-view-modal` timeline builders / `lib/fulfillment-stage-display.ts`.
- **COPY watermark on invoice HTML**: `showWatermark = printCount > 0` at render time. View-only print of an already-printed order may still show COPY; that is display-only and does not mutate.

## Validation / invariants

1. View-only print request **MUST NOT** write any of the fields in the table above.
2. Formal print request **MUST** continue to write print fields per current invoice route logic.
3. Order id path param **MUST** remain a valid CUID (`cuidSchema`).
4. Company scoping: order must belong to the authenticated user’s company (existing).

## State transitions

```text
[Unprinted order]
  -- Print Invoice (view-only) --> [Still unprinted] + printable HTML / autoPrint
  -- Formal print (?print=1)   --> [Printed: printCount++, lastPrinted*, maybe stage]

[Printed order]
  -- Print Invoice (view-only) --> [Same printed state] + printable HTML / autoPrint
  -- Formal print (?print=1)   --> [printCount++, lastPrinted* updated]

[Cancelled order]
  -- Print Invoice (view-only) --> [Still cancelled; print fields unchanged] if GET allowed
```

No new state machine. Cancel / other workflow statuses are out of scope except “must not change.”
