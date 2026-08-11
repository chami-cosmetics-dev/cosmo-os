# POST /api/public/rider-delivery/[token]

Public delivery confirm / fail via SMS link (`/r/d/{token}`).

## Auth
- None (secret token in path); token length ≥ 16

## Body
```json
{ "confirmed": true }
```
or
```json
{ "confirmed": false, "failureReason": "…" }
```

## Behavior — confirm success path
1. Resolve order by `riderDeliveryToken`
2. If already `delivery_complete` → `200` already confirmed (idempotent)
3. Load `RiderDeliveryTask` for order if any
4. **If task exists**: set task `completed` + `completedAt`; set order delivery-complete fields; set `deliveryCompleteById` = task.`riderId` when possible; clear token; trigger existing SMS/approval side effects as today
5. **If no task**: set order delivery-complete + clear token only; **do not** create a task or invent rider performance credit
6. Must not double-complete

## Behavior — fail path
- Unchanged intent: task `failed` when present; order returned-to-store / failure fields as today

## Response
- `200` `{ success: true, message? }`
- `400` validation
- `404` invalid token

## Parity note
Mobile `POST /api/mobile/v1/deliveries/[id]/complete` remains the authenticated channel; both MUST leave the same task+order completion outcome when a task exists so admin Riders / performance refresh correctly.
