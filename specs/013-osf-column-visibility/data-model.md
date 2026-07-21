# Data Model: OSF Column Visibility by User

## Entities

### OsfUserColumnAccess (new)

Per Cosmo user, company-scoped marks for optional OSF Excel column groups.

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | PK |
| companyId | string | FK company; required |
| userId | string | FK user; required |
| columnGroups | string[] | Group ids from catalog; `core` implied even if omitted |
| createdAt | datetime | |
| updatedAt | datetime | |

**Uniqueness**: `(companyId, userId)` unique.

**Validation**:

- `userId` / `companyId` must be valid CUIDs.
- Each `columnGroups` entry MUST be a known group id (`pricing` \| `cost` \| `margins` \| `sales`); reject unknown.
- Server always treats `core` as included; UI need not send it.
- User must belong to same company as the assigner.

**Lifecycle**:

- Created/updated via PUT from assignment UI.
- If assignee loses all purchasing permissions: row may remain but is ignored for listing; optional cleanup on save of list refresh.
- Deleting a user: cascade or explicit delete with user (follow existing User relation patterns).

### Column group (code catalog, not a DB table)

See [research.md](./research.md) R3. Ids: `core`, `pricing`, `cost`, `margins`, `sales`.

### Permission (existing seed)

| Key | Purpose |
|-----|---------|
| `purchasing.osf.permission` | Open assignment UI; mutate marks; also implies full columns on own download |
| `purchasing.osf.manage` | Existing OSF manage; full columns on download (no assignment UI unless also has `.permission`) |
| `purchasing.osf.read` | Full OSF generate (columns filtered by marks unless manage/permission) |
| `purchasing.tools.read` | Reorder-only generate (same column filter rules) |

### Relationships

```text
Company 1──* OsfUserColumnAccess *──1 User
```

## Effective resolution (derived, not stored)

```text
if has(manage) OR has(osf.permission):
  → all groups
else:
  → { core } ∪ OsfUserColumnAccess.columnGroups  (or { core } if no row)
```

Applied identically to full OSF and reorder-only downloads.
