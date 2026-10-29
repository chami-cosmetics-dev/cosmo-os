# Implementation Plan: Manual Loyalty Override

**Branch**: `069-manual-loyalty-override` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/069-manual-loyalty-override/spec.md`

## Summary

Permitted users (admins + `contacts.loyalty.manual_assign`) can set Gold or Platinum on Customer Insight for contacts who do not meet the spend band. Reason is required. Seeded templates are OS-scoped; custom templates save locally and copy to the other OS when `LOYALTY_REASON_PEER_URL` + sync secret are set. Override still pushes ERP customer group and Shopify tags like eligible assign.

## Technical Context

**Language/Version**: TypeScript, Next.js App Router  
**Storage**: PostgreSQL / Prisma (`ContactMaster.loyaltyAssignedReason`, `LoyaltyReasonTemplate`)  
**Testing**: Vitest  
**Constraints**: Same Prisma schema on Vault, Cosmo-dev, Cosmo-prod. Migration via `db:migrate:create` then `db:deploy:all`.

## Constitution Check

- Multi-DB migration: one migration file, deploy all three when shipping.  
- No prod deploy/push without explicit user confirmation.  
- Scope: Insight card only; no merchant dashboard override.

## Source

- `lib/customer-insight/loyalty-manual.ts` — which tiers are overridable  
- `lib/customer-insight/loyalty-reason-catalog.ts` — seeded reasons + OS visibility  
- `lib/customer-insight/loyalty-reason-templates.ts` — persist + peer copy  
- `app/api/admin/customer-insight/contact/[contactId]/loyalty-override/route.ts`  
- `app/api/admin/customer-insight/loyalty-reason-templates/route.ts`  
- `app/api/internal/loyalty-reason-templates/route.ts`  
- Insight card + `manual-loyalty-dialog.tsx`
