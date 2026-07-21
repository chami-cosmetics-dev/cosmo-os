# Quickstart: OSF Column Visibility by User

## Prerequisites

- Cosmo env with OSF already working (ERP + generate).
- Migrate after implementation: `npm run db:migrate:create` (local) then **user-confirmed** `npm run db:deploy:all`.
- Roles UI: grant `purchasing.osf.permission` to an assigner; grant `purchasing.osf.read` / `purchasing.tools.read` to downloaders as needed.

## Validation scenarios

### 1. Permission chip

1. Open Roles → Purchasing.
2. Confirm chip `purchasing.osf.permission` exists and can be assigned.

### 2. Assignment UI

1. Log in as user with `purchasing.osf.permission`.
2. Open `/dashboard/purchasing/osf`.
3. Confirm small column-access panel lists purchasing users.
4. Log in without that permission → panel hidden.

### 3. Restricted download

1. As assigner, mark User A with **margins** only (no cost/pricing).
2. Leave User B unmarked.
3. As User A (`purchasing.osf.read`): Generate OSF → Excel has Cosmetics/OGF Margin %; no Latest Cost if cost unmarked.
4. As User B: Generate OSF → core columns only; no margins/cost/pricing/sales.
5. Repeat with **Download reorder-only OSF** (`purchasing.tools.read`) → same column rules.

### 4. Full columns for manage / permission

1. As `purchasing.osf.manage` or `.permission` user, download OSF.
2. Confirm full standard columns (including cost + margins + pricing + sales).

### 5. Hard-code removed

1. Search codebase: no `BUYERS_WITH_MARGIN_COLUMNS` / Inoka–Dilrukshi margin hard-code.
2. Inoka/Dilrukshi Cosmo users get margins only if marked in the UI (or if they hold manage/permission).

## Commands

```bash
npm test
npm run lint
# migrate + deploy only with explicit confirmation for shared DBs
```

## Refs

- [contracts/osf-column-visibility.md](./contracts/osf-column-visibility.md)
- [data-model.md](./data-model.md)
- [research.md](./research.md)
