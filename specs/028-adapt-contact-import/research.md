# Research: Adapt Contact & Purchase History Import

**Feature**: `028-adapt-contact-import`  
**Date**: 2026-07-31

## R1 — Storage: dedicated history vs Cosmo Orders

**Decision**: Persist Adapt purchases only in a new `AdaptPurchaseHistory` table linked to `ContactMaster`. Never create `Order` (or `Customer`) rows for Adapt imports.

**Rationale**: Spec clarification + FR-006. Today contact purchase history is loaded from `Order` via phone/email match (`app/api/admin/contacts/[id]/orders/route.ts`). Creating historical Orders would risk fulfillment queues, ERP sync, and SMS. A dedicated table keeps CRM history isolated.

**Alternatives considered**:
- Cosmo Orders with `sourceName: "adapt"` + queue exclusions — rejected (high blast radius, FR-006 forbids).
- JSON blob on ContactMaster — rejected (not queryable/idempotent at invoice grain).

## R2 — Operator delivery: CLI vs admin UI

**Decision**: One-time ops CLI (`scripts/import-adapt-sales-invoices.cjs` or `.mjs`) with `--dry-run` and real run. No general in-app import UI for v1.

**Rationale**: Spec clarification (ops operator uploads once). Closest existing pattern is `scripts/backfill-erp-customer-contacts.mjs` (`--dry-run`, `--company-id`, env wrapper) plus CSV parsing lessons from `scripts/import-contacts.cjs`. Do **not** use `app/api/admin/contacts/import` as the primary Adapt path (that is recurring Contact Master CSV for admins).

**Alternatives considered**:
- Admin upload page / reuse contacts import route — rejected by clarification (not a general admin feature).
- Continuous Adapt sync — out of scope (one-time migration).

## R3 — File parsing

**Decision**: Primary input is **`invoice_data_headers.csv`** (~723 MB, 86 columns). Support streaming CSV row-by-row (do not load entire file into memory). Excel optional later; these production dumps are CSV. Parse dates as Adapt local `D/M/YYYY` or `D/M/YYYY H:M:S`. Accept Adapt header spellings as-is (`merchent_id`, `payment_methode`, `cancel_coment`, `shiping_service_name`).

**Rationale**: User confirmed Archive files. The “headers” filename is misleading — it is the enriched full export and includes `location_name` / `KnownName` required for merchant-facing history. `sales_invoice_master.csv` lacks those display fields.

**Alternatives considered**:
- Import lean `sales_invoice_master.csv` only — rejected as default (no location/merchant display names).
- Load full file with `xlsx` — rejected for ~700 MB CSV (stream instead).

### Confirmed column sets

**Primary (`invoice_data_headers.csv`) extras vs lean file:**  
`sales_invoice_type_name`, `location_name`, `KnownName`, `shiping_service_name`, `in_payment_type_name`, `added_by_name`, `last_updated_by_name`, `deleted_by_name`, and other `*_by_name` fields.

**Shared identity/CRM columns (both files):**  
`sales_invoice_master_id`, `sales_invoice_no`, `sales_location_id`, `invoice_date`, `merchent_id`, `customer_master_id`, `customer_tp`, `customer_tp_raw`, `customer_email`, `attention_name`, `ttl_amount`, `payment_methode`, `active_flag`, `deleted_on`, `cancel_coment`, `district`, `zone`, `nearest_outlet`, `customer_shipping_address`, `post_code`, `shopify_id`, cash/card payment amounts, etc.

## R4 — Contact matching & ambiguous phones

**Decision**: Reuse `findMatchingContacts` + `buildPhoneLookupVariants` / `normalizeContactEmail`. When multiple contacts match, pick one best match using the same preference order as `pickBetterContact` in `lib/contact-display-dedupe.ts` (prefer contact with newer `lastPurchaseAt`, then newer `updatedAt`); count row as **ambiguous** in the report; do not write to other matches.

**Rationale**: Spec FR-002 clarification. Avoid inventing a second phone-matching system.

**Alternatives considered**:
- Skip all multi-match rows — rejected (loses migration value).
- Write to every match — rejected (duplicates history).

## R5 — Fill-blanks enrichment

**Decision**: Build a patch object that sets ContactMaster CRM fields only when the current DB value is null/blank. Never overwrite name, email, phone, address, district, zone, remarks, etc. Ensure secondary `ContactPhone` / `ContactEmail` rows via existing `ensureSecondaryContactIdentifiers` when new identifiers appear.

**Rationale**: Spec FR-003 clarification. Aligns with `contact-master-sync.ts` “only set when blank” patterns for source/name.

**Alternatives considered**:
- Adapt overwrites CRM profile — rejected by clarification.

## R6 — Location mapping

**Decision**: Optional mapping file (JSON/CSV) keyed by Adapt `sales_location_id` and/or normalized `location_name` → Cosmo `CompanyLocation.id`. On hit, set `companyLocationId` on history row; always store Adapt location text fields. Missing map does not skip the purchase. Auto-assist may also match Cosmo `name` / `shortName` / `locationReference` when map entry is absent.

**Rationale**: Spec clarification B. One-time map is simpler than a permanent admin mapping UI (Principle V). `CompanyLocation.locationReference` is already used elsewhere as a stable external key.

**Alternatives considered**:
- Require full mapping before import — rejected.
- Auto-fuzzy match only — rejected as sole strategy; explicit map preferred with exact/normalized name/`locationReference` fallback.

## R7 — Invoice identity & idempotency

**Decision**: Unique key per company: prefer `sales_invoice_master_id` when present; else composite `sales_invoice_no|sales_location_id|invoice_date` (normalized). Upsert on that key so re-runs do not duplicate.

**Rationale**: Spec edge case for duplicate invoice numbers across locations; FR-008.

**Alternatives considered**:
- Unique on `sales_invoice_no` alone — rejected (collisions across locations).

## R8 — Merchant purchase history UI

**Decision**: Extend `GET /api/admin/contacts/[id]/orders` to also load `AdaptPurchaseHistory` for the contact and return a unified list (or `orders` + `adaptPurchases`). UI shows Adapt rows with source badge “Adapt”; omit Cosmo order invoice deep-link when there is no `Order.id`. Sort combined list by date descending.

**Rationale**: FR-005 — same merchant-facing experience. Minimal UI change vs new page.

**Alternatives considered**:
- Separate Adapt-only tab — acceptable alternate; default is merged list with label.
- Only update `lastPurchaseAt` — rejected (FR-005 requires list).

## R9 — Skip / exclude rules

**Decision**: Skip (count as skipped) when: `deleted_on` set; cancel fields indicate cancelled; `active_flag` inactive; neither usable phone nor email. On empty/unparseable `ttl_amount` or date: skip purchase write but still attempt contact fill-blanks if identifiers exist (error/skip counters distinct).

**Rationale**: FR-007 and edge cases.

## R10 — lastPurchaseAt / recentMerchant

**Decision**: After successful purchase upsert, update contact `lastPurchaseAt` / `recentMerchant` only when Adapt `invoice_date` is newer than current snapshot (reuse pattern from `updatePurchaseSnapshotForContacts` in `contact-master-sync.ts`). `recentMerchant` from Adapt `KnownName` text only — do not set `assignedMerchant` Cosmo user id.

**Rationale**: FR-010; KnownName best-effort text only.

## R11 — Target company / Vault

**Decision**: Script requires `--company-id` for Cosmetics Cosmo company. Vault OS out of scope unless separately requested.

**Rationale**: Spec assumptions; env isolation (Principle II).

## R12 — Agent context script

**Decision**: No `.specify` agent-context update script exists in this repo; skip agent-context refresh for this plan.

**Rationale**: Skill step optional when tooling absent.
