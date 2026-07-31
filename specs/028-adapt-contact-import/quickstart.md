# Quickstart: Adapt Contact & Purchase History Import

**Feature**: `028-adapt-contact-import`  
**Date**: 2026-07-31

Validate end-to-end against [spec.md](./spec.md), [data-model.md](./data-model.md), and [contracts/adapt-contact-import.md](./contracts/adapt-contact-import.md).

## Prerequisites

1. Cosmetics Cosmo target env selected: `npm run env:use cosmo-dev` (or agreed target).
2. Migrations applied: `npm run db:generate` then `npm run db:deploy:<target>` (prod only with explicit confirmation). Migration: `20260731095009_add_adapt_purchase_history`.
3. Sample Adapt CSV — full run uses `invoice_data_headers.csv` (~723 MB). For validation use a carved sample or `lib/adapt-import/fixtures/adapt-quality-sample.csv`.
4. Optional location map from `scripts/adapt-location-map.example.json` with a real Cosmo `companyLocationId`.
5. Cosmetics `--company-id`.

### Seed Adapt history for UI-only check

```bash
node scripts/with-env.mjs cosmo-dev npx --yes tsx scripts/seed-adapt-purchase-history.ts --company-id <COMPANY_ID> --contact-id <CONTACT_ID>
```

Open Contact Master / Contact Updates → purchase history; expect an **Adapt** row.

## Unit checks

```bash
npm test -- adapt-import
```

## Dry-run

Put all arguments on **one line** (PowerShell does not continue with `\`):

```bash
node scripts/with-env.mjs cosmo-dev npx --yes tsx scripts/import-adapt-sales-invoices.ts --company-id <COMPANY_ID> --file ./lib/adapt-import/fixtures/adapt-quality-sample.csv --dry-run --report ./data/adapt-dry-run-report.json
```

**Expect**: would-counts only; skips for cancelled / no-id / bad amount; no DB writes.

## Real import (sample)

```bash
node scripts/with-env.mjs cosmo-dev npx --yes tsx scripts/import-adapt-sales-invoices.ts \
  --company-id <COMPANY_ID> \
  --file ./path/to/adapt-sample.csv \
  --map ./path/to/adapt-location-map.json \
  --report ./data/adapt-real-report.json
```

Primary file: `invoice_data_headers.csv` (streamed). Re-run must not duplicate `adaptInvoiceKey` rows.

## Merchant UI check

1. Open Contact Master or Contact Updates.
2. Search an imported/seeded phone.
3. Open purchase history — Adapt rows labeled Adapt, no Cosmo invoice deep-link, no fulfillment queue entry.

## Done when

- [ ] Dry-run / real-run reports match expectations on sample
- [ ] Idempotent re-run → 0 duplicate history keys
- [ ] Merchant can find Adapt history in existing contact UI
- [ ] `npm test -- adapt-import` passes
