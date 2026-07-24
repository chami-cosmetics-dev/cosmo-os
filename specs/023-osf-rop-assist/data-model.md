# Data Model: OSF Live Refresh & ROP Assist

## Entities (existing — no new tables for v1)

### ProductItem (existing)

| Field | Role |
|-------|------|
| sku | Assist row identity |
| erp1ProductPriority / erp2ProductPriority | Filter/sort; “Top Priority” match if either equals `Top Priority` |
| erpPrioritySyncedAt | Updated by priority sync on OSF open |

### ProductOsfRop (existing)

| Field | Role |
|-------|------|
| companyId, sku, columnKey | Unique ROP target |
| ropQty | Saved ROP; updated only on explicit assist save |

### OsfColumnConfig (existing)

Active rows with `includeInRop` define which columnKeys receive the accepted suggested value in v1.

### Derived (not stored)

| Concept | Definition |
|---------|------------|
| Assist as-of date | Colombo calendar date when assist loads / user-selected as-of |
| Last purchase date | From ERP purchase merge (same as OSF) |
| Assist window start | Purchase date if valid ≤ as-of; else as-of − 30 days |
| Assist window end | Start of next calendar day after as-of (exclusive) |
| Sales in window | Sum of Cosmo completed line qty in window |
| Suggested ROP | `roundHalfUp(salesInWindow)` |
| Total stock (assist) | Sum of live Bin qty across active includeInStock OSF columns |

## Validation

- `ropQty` on save: integer 0…1_000_000 (align with existing OSF profile ROP validation).
- `sku`: must exist in company catalog.
- Priority filter: free string; default `Top Priority`.

## State / lifecycle

```text
Open OSF → POST refresh (priority sync)
         → GET page-data (stock + purchase + sales + current ROP + suggested)
         → User edits/selects
         → PUT rops (upsert ProductOsfRop)
         → Optional: Generate OSF (existing)
```

Suggestions are never persisted until PUT.
