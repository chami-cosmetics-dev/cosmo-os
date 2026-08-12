# Contracts: Contact Email Cleanup

**Feature**: `040-contact-email-cleanup`  
**Auth**: Authenticated + `contacts.master.manage` **or** `contacts.manage`

---

## GET `/api/admin/contacts/email-cleanup`

List contacts with suspect emails for review.

### Query

| Param | Type | Notes |
|-------|------|--------|
| `reason` | `invalid` \| `cosmetics_pattern` | Required |
| `page` | int? | Default 1 |
| `pageSize` | int? | Default 50, max 100 |

### Response `200`

```json
{
  "items": [
    {
      "contactId": "cuid",
      "name": "string",
      "phoneNumber": "string|null",
      "email": "string|null",
      "matchedEmail": "string",
      "reason": "invalid"
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 123
}
```

### Errors

| Status | When |
|--------|------|
| 400 | Missing/invalid `reason` or paging |
| 401/403 | Auth / permission |

### Semantics

- `invalid`: primary **or secondary** email non-empty after trim and fails shared format validation.
- `cosmetics_pattern`: primary or secondary email contains `cosmetic` or `cosmatics` (case-insensitive).
- Clear removes **only** matching address(es) for the reason; unrelated valid emails on the same contact are kept; promote valid secondary to primary when primary was cleared (FR-012).
- Empty list → `items: []`, `total: 0` (not an error).

---

## POST `/api/admin/contacts/email-cleanup/clear`

Clear matching emails for selected contacts.

### Body

```json
{
  "reason": "invalid|cosmetics_pattern",
  "contactIds": ["cuid", "..."]
}
```

| Field | Rules |
|-------|--------|
| `reason` | Required; same enum as list |
| `contactIds` | 1–50 cuids; company-scoped |

### Behavior

1. Require explicit client confirmation before calling (UI).
2. For each id: re-validate still matches `reason`; skip with per-id error if not.
3. Clear **only** matching primary / delete matching secondary emails; promote oldest valid secondary to primary when primary was cleared (FR-012).
4. Write audit `contacts` / `contact_email_cleared` per successful clear.

### Response `200`

```json
{
  "cleared": 10,
  "skipped": [
    { "contactId": "cuid", "error": "no longer matches reason" }
  ]
}
```

### Errors

| Status | When |
|--------|------|
| 400 | Invalid body / empty ids / >50 |
| 401/403 | Auth / permission |

---

## Insight display (UI contract, no new API)

Existing insight payload already includes `contact.email: string | null`.

| Condition | UI |
|-----------|-----|
| `email` non-empty after trim | Always show email row: Mail icon + address |
| `email` null/empty | Always show email row: `-` (no icon) |

No API change required unless filter-list rows gain an optional compact email indicator (then extend filter DTO with `email` / `hasEmail` only if not already present).
