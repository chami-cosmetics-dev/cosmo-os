# Contract: Returned-Order Cancellation Workflow

**Feature**: `010-cosmo-return-cancel`  
**Audience**: Returned-orders UI, return action API, finance workflow, Shopify/ERP integration

## 1. Server policy contract

### Inputs

- server-only deployment variant (`cosmo`, `vault`, or unknown);
- current `Order.financialStatus`;
- whether required direct-cancel integrations are configured for the order location;
- return/order state and pending approval state.

### Output

```ts
type ReturnCancelAction = "direct_cancel" | "request_cancel" | "none";

type ReturnCancelPolicy = {
  action: ReturnCancelAction;
  reason: string | null;
};
```

### Rules

| Deployment | Normalized financial status | Capability | Action |
|---|---|---:|---|
| Vault | any | any | `request_cancel` |
| Unknown/misconfigured | any | any | `request_cancel` |
| Cosmo | `paid` | any | `request_cancel` |
| Cosmo | any other/null | available | `direct_cancel` |
| Cosmo | any other/null | unavailable | `request_cancel` |

Solved/voided/conflicting returns resolve to `none`.

The mutation endpoint must recompute this policy. Client input never overrides it.

## 2. Returned-orders page-data contract

Each return row adds:

```ts
{
  cancelAction: "direct_cancel" | "request_cancel" | "none";
  cancelActionReason: string | null;
  directCancelStatus: "processing" | "failed" | "completed" | null;
  shopifyCancelStatus:
    | "pending"
    | "cancelled"
    | "already_cancelled"
    | "not_applicable"
    | "failed"
    | null;
  erpCancelStatus:
    | "pending"
    | "cancelled"
    | "already_cancelled"
    | "not_applicable"
    | "failed"
    | null;
  directCancelError: string | null;
}
```

The response contains safe display text only; no credentials or raw provider payloads.

## 3. Submit cancel intent

`PUT /api/admin/returns/{id}`

### Request

```json
{
  "actionType": "cancel",
  "cancelRemark": "Customer no longer wants the returned order"
}
```

The neutral `cancel` intent replaces the client choosing direct versus finance. Existing `request_cancel` may be accepted temporarily but must still run the same server policy.

### Authorization and validation

- authenticated user;
- `returns.manage`;
- CUID-valid `{id}`;
- return belongs to the user’s company;
- preserve existing merchant ownership scope unless user has `orders.manage`;
- `cancelRemark` required after trimming and within shared limit;
- return is pending and not already voided/solved;
- no conflicting action or pending return-cancel approval.

### Validation failure

HTTP `400`, `403`, or `404` as appropriate:

```json
{
  "error": "Safe user-facing message",
  "code": "VALIDATION_OR_AUTHORIZATION_CODE"
}
```

No provider or state mutation occurs.

### Conflict

HTTP `409 Conflict`:

```json
{
  "error": "This returned order already has a cancellation action in progress.",
  "code": "RETURN_CANCEL_CONFLICT"
}
```

## 4. Finance-path result

Applies to paid Cosmo returns, all Vault returns, and fail-closed configuration cases.

### Success

HTTP `200 OK`:

```json
{
  "ok": true,
  "cancelMode": "finance_approval",
  "approvalRequestId": "cuid",
  "returnedOrder": {
    "actionType": "cancel",
    "actionStatus": "pending"
  }
}
```

Required invariants:

- return update and pending `return_cancel` approval commit atomically;
- duplicate pending approval is reused, not duplicated;
- notification occurs after commit;
- no direct Shopify/ERP cancellation is attempted.

## 5. Direct-path result

Applies only to eligible non-paid Cosmo returns with configured capability.

### Completed

HTTP `200 OK`:

```json
{
  "ok": true,
  "cancelMode": "direct",
  "returnedOrder": {
    "actionType": "cancel",
    "actionStatus": "solved",
    "directCancelStatus": "completed",
    "shopifyCancelStatus": "cancelled",
    "erpCancelStatus": "already_cancelled"
  },
  "order": {
    "financialStatus": "voided"
  }
}
```

`cancelled`, `already_cancelled`, and `not_applicable` are all terminal-success provider outcomes.

### Processing conflict

If another direct attempt owns the active claim, return `409`:

```json
{
  "error": "Cancellation is already in progress.",
  "code": "RETURN_CANCEL_IN_PROGRESS",
  "retryable": true
}
```

### Partial/recoverable failure

HTTP `502 Bad Gateway` for provider failure, or `500` for local finalization failure:

```json
{
  "error": "The order was not fully cancelled. Review the statuses and retry.",
  "code": "RETURN_CANCEL_PARTIAL_FAILURE",
  "retryable": true,
  "returnedOrder": {
    "actionStatus": "pending",
    "directCancelStatus": "failed",
    "shopifyCancelStatus": "cancelled",
    "erpCancelStatus": "failed",
    "directCancelError": "ERP cancellation failed. Retry is available."
  }
}
```

Required invariants:

- do not return `ok: true`;
- do not mark the return solved;
- do not mark the OS order voided until all providers are terminal-success;
- persist completed-provider outcomes;
- expose only sanitized errors.

## 6. Retry direct cancellation

The same neutral cancel request retries a failed direct flow.

### Preconditions

- server policy still permits direct cancellation;
- return has `directCancelStatus="failed"`;
- no finance approval has been created;
- caller still passes authorization/company/merchant checks.

### Behavior

- atomically move overall state to `processing`;
- skip provider statuses already `cancelled`, `already_cancelled`, or `not_applicable`;
- retry pending/failed providers;
- repeat local finalization when providers are complete;
- preserve the original `cancelRequestedAt` and update action/attempt metadata.

## 7. Shopify adapter contract

```ts
type ShopifyCancelOutcome =
  | { outcome: "cancelled" }
  | { outcome: "already_cancelled" }
  | { outcome: "not_applicable" };
```

- Real Shopify ID + successful cancel → `cancelled`.
- Confirmed already-cancelled order → `already_cancelled`.
- ERP-native `erp-*` ID → `not_applicable`.
- Missing token/store handle, network failure, or unconfirmed provider rejection → throw sanitized integration error.

## 8. ERP adapter contract

```ts
type ErpCancelOutcome =
  | { outcome: "cancelled"; invoiceName: string }
  | { outcome: "already_cancelled"; invoiceName: string }
  | { outcome: "not_applicable" };
```

- Submitted SI cancelled → `cancelled`.
- Cancelled SI found → `already_cancelled`.
- Definitive location-scoped lookup proves no SI → `not_applicable`.
- Missing configuration, ambiguous lookup, unexpected state, or provider failure → throw sanitized integration error.

## 9. Audit and observability contract

Audit direct cancel requested, each terminal attempt, and final completion/failure with:

- company, order, return, actor, and location IDs;
- normalized financial status and selected policy;
- Shopify and ERP outcomes;
- sanitized error;
- timestamps.

Never log tokens, credentials, authorization headers, or unbounded raw provider bodies.

## 10. Existing workflow compatibility

- Paid Cosmo and all Vault return cancels continue through `return_cancel` finance approvals.
- Existing finance approve/reject semantics remain unchanged.
- Rearrange, bank-transfer rearrange approval, store return marking, finance-reverted return handling, and generic order cancellation are unchanged.
