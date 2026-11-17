# Contracts: Loyalty SMS Templates

## 1. List / upsert / delete SMS templates

### `GET /api/admin/company/sms-templates`

**Auth**: session + `settings.sms_portal`  
**Response** `200`:

```json
{
  "templates": [
    {
      "id": "cuid-or-null",
      "key": "loyalty_gold_wish_1",
      "name": "Gold wish A",
      "purpose": "gold_wish",
      "body": "Congrats {{customerName}}…",
      "active": true,
      "placeholders": [
        "customerName",
        "tier",
        "discountPercent",
        "merchantName",
        "merchantPhone",
        "officePhone"
      ],
      "builtin": true,
      "saved": false
    }
  ],
  "officeContactPhone": "0112345678"
}
```

Merge builtins with stored rows (Email Templates pattern). Include `officeContactPhone` from `LoyaltySmsConfig` (empty string if unset).

### `PUT /api/admin/company/sms-templates`

**Auth**: `settings.sms_portal`  
**Body**:

```json
{
  "key": "loyalty_gold_wish_1",
  "name": "Gold wish A",
  "purpose": "gold_wish",
  "body": "…",
  "active": true
}
```

**Rules**:
- Builtin keys: `purpose` ignored/locked to catalog; key cannot change.
- New custom keys: `purpose` required (`gold_wish` | `platinum_wish` | `custom`).
- Reject empty body; enforce key regex and length limits (Zod + `LIMITS`).

**Response** `200`: updated template DTO.  
**Errors**: `401` / `403` / `400` validation.

### `DELETE /api/admin/company/sms-templates`

**Body**: `{ "key": "my_custom_key" }`  
**Rules**: Builtin keys → `400`. Custom → delete row.  
**Response** `200`: `{ "ok": true }`.

---

## 2. Office contact number

### `PUT /api/admin/company/loyalty-sms-config`

**Auth**: `settings.sms_portal`  
**Body**: `{ "officeContactPhone": "011…" }`  
**Response** `200`: `{ "officeContactPhone": "011…" }`

(Optional: fold PUT into sms-templates route; if folded, document single upsert endpoint in implementation tasks.)

---

## 3. Loyalty wish send (internal helper — not a public route)

Called from loyalty assign/override after successful tier persistence when tier is newly set to `gold` or `platinum`.

**Input** (logical):

```ts
{
  companyId: string;
  contactId: string;
  tier: "gold" | "platinum";
  actorUserId?: string | null;
}
```

**Behavior**:
1. If success wish exists for `(companyId, contactId, tier)` → no SMS; status `skipped_already_sent`.
2. Load active templates with matching purpose; if empty → `skipped_no_template`.
3. Load contact phone; if missing → `skipped_no_phone`.
4. Resolve merchant + office phone; pick random template; render placeholders.
5. `sendSms(...)`; write/upsert `LoyaltyWishSend`; leave loyalty HTTP success intact on failure.

**No new public customer-facing API** for send in v1.

---

## 4. Settings UI contract

**Route**: `/dashboard/settings/sms-templates`  
**Gate**: `settings.sms_portal` (redirect/forbid otherwise).

**Layout** (Email Templates analogue):
- Left: template list + **+ New**
- Center: name, key (locked for builtin), purpose, active, body
- Right: preview with sample placeholder values
- Header/actions: office contact phone field + save

**Nav**: Sidebar + settings hub card next to Email Templates / SMS Notifications.

---

## 5. Loyalty route behavior addendum

### `POST .../loyalty-assign` and `POST .../loyalty-override`

Unchanged success JSON shape. After DB tier write for a **new** tier (not retry-same-tier):

- Invoke loyalty wish helper.
- Do **not** add SMS failure to `pushErrors` in a way that fails the assign; optional non-blocking `loyaltySmsStatus` field is allowed but not required for v1.
