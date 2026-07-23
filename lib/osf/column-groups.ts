/**
 * Legacy OSF column *groups* (pricing/cost/margins/sales) — superseded by
 * per-column access keys in `lib/osf/column-access-catalog.ts`.
 * Kept only for expandLegacyColumnGroups during migration/docs.
 */

export {
  expandLegacyColumnGroups,
  LEGACY_GROUP_TO_COLUMN_KEYS,
} from "@/lib/osf/column-access-catalog";
