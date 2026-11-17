# Implementation Plan: Loyalty SMS Templates

**Branch**: `070-loyalty-sms-templates` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/070-loyalty-sms-templates/spec.md`

## Summary

When a contact is assigned or upgraded to Gold or Platinum, Cosmo OS sends a congratulatory SMS (10% / 15% discount) that includes allocated merchant name, Staff mobile, and a configurable office contact number. Ops manage reusable SMS templates in a settings UI mirrored on Email Templates: four seeded wish templates (2 Gold, 2 Platinum), edit/save/add, and uniform random pick among active templates for the target tier. Send failures never block loyalty assignment; Hutch SMS + `SmsLog` remain the delivery path.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js App Router  
**Primary Dependencies**: React, Prisma, Zod, existing Hutch SMS (`lib/hutch-sms.ts`), RBAC (`lib/rbac.ts`)  
**Storage**: Neon PostgreSQL via Prisma — new `SmsTemplate`, `LoyaltySmsConfig`, `LoyaltyWishSend`; reuse `SmsLog`, `User.mobile`, `ContactMaster.assignedMerchant` / `loyaltyAssignedTier`  
**Testing**: Vitest (catalog merge, placeholder render, random pool, merchant resolve, dedupe rules)  
**Target Platform**: Cosmo OS web (`os.cosmetics.lk`); Vault OS out of scope for v1  
**Project Type**: Web application (Next.js monolith)  
**Performance Goals**: Wish SMS attempt within ~2 minutes of successful tier write; template CRUD interactive  
**Constraints**: Loyalty assign/override must succeed if SMS fails; same Prisma schema on vault / cosmo-dev / cosmo-prod; migration via `npm run db:migrate:create` then `db:deploy:all`  
**Scale/Scope**: One settings page, one send helper hooked from two loyalty routes; four builtins + custom templates per company

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Multi-Database Migration Discipline | PASS | New models require one migration created with `db:migrate:create`; deploy all three DBs when shipping — never `db:push` on shared targets |
| II. Environment & Credential Isolation | PASS | Reuse company `SmsPortalConfig`; no new secrets in repo |
| III. Test & Typecheck Gates | PASS | Unit tests for render/select/dedupe; `npm test` + lint clean on touched files |
| IV. Production Deployment Safety | PASS | No prod push/deploy from this plan; user confirms later |
| V. Simplicity & Scope Discipline | PASS | Mirror EmailTemplate pattern; reuse `settings.sms_portal`; no Vault dual-write; no “avoid last used” random logic |

**Post-design re-check**: Still PASS — dedicated `LoyaltyWishSend` for dedupe is justified (FR-010) vs fragile SmsLog string markers; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/070-loyalty-sms-templates/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── loyalty-sms-templates.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
prisma/schema.prisma                    # SmsTemplate, LoyaltySmsConfig, LoyaltyWishSend
lib/sms-templates/
  catalog.ts                            # 4 builtin wish templates + key regex
  render.ts                             # {{placeholder}} substitution
  select.ts                             # active pool + uniform random by tier
  merchant-contact.ts                   # resolve allocated merchant name + User.mobile
  loyalty-wish-send.ts                  # orchestrate: dedupe → render → sendSms → log
app/api/admin/company/sms-templates/
  route.ts                              # GET list / PUT upsert / DELETE custom
app/api/admin/company/loyalty-sms-config/
  route.ts                              # GET/PUT office contact number
app/(dashboard)/dashboard/settings/sms-templates/
  page.tsx                              # settings page (Email Templates layout)
components/molecules/
  sms-templates-settings-form.tsx       # list + editor + preview
app/api/admin/customer-insight/contact/[contactId]/
  loyalty-assign/route.ts               # after successful tier write → wish send
  loyalty-override/route.ts             # same hook
lib/rbac.ts                             # sidebar/settings entry under settings.sms_portal
components/organisms/app-sidebar.tsx
app/(dashboard)/dashboard/settings/page.tsx
```

**Structure Decision**: Single Next.js app. New `lib/sms-templates/*` mirrors `lib/email-templates/*`. Settings UI mirrors Email Templates (not Order SMS Notifications, which are fixed triggers). Hook send after existing loyalty assign/override persistence.

## Complexity Tracking

> No constitution violations requiring justification.
