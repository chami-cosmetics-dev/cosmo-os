/** OSF Excel column groups for per-user download visibility. */

export const OSF_COLUMN_GROUP_CORE = "core" as const;
export const OSF_COLUMN_GROUP_PRICING = "pricing" as const;
export const OSF_COLUMN_GROUP_COST = "cost" as const;
export const OSF_COLUMN_GROUP_MARGINS = "margins" as const;
export const OSF_COLUMN_GROUP_SALES = "sales" as const;

export const OSF_OPTIONAL_COLUMN_GROUPS = [
  OSF_COLUMN_GROUP_PRICING,
  OSF_COLUMN_GROUP_COST,
  OSF_COLUMN_GROUP_MARGINS,
  OSF_COLUMN_GROUP_SALES,
] as const;

export type OsfOptionalColumnGroupId = (typeof OSF_OPTIONAL_COLUMN_GROUPS)[number];

export type OsfColumnGroupId =
  | typeof OSF_COLUMN_GROUP_CORE
  | OsfOptionalColumnGroupId;

export const ALL_OSF_COLUMN_GROUPS: OsfColumnGroupId[] = [
  OSF_COLUMN_GROUP_CORE,
  ...OSF_OPTIONAL_COLUMN_GROUPS,
];

export const OSF_OPTIONAL_GROUP_META: Array<{ id: OsfOptionalColumnGroupId; label: string }> =
  [
    { id: OSF_COLUMN_GROUP_PRICING, label: "Pricing (MRP / discounted / OGF)" },
    { id: OSF_COLUMN_GROUP_COST, label: "Purchasing cost & supplier" },
    { id: OSF_COLUMN_GROUP_MARGINS, label: "Cosmetics & OGF margins" },
    { id: OSF_COLUMN_GROUP_SALES, label: "Monthly sales units" },
  ];

export function isOptionalColumnGroup(id: string): id is OsfOptionalColumnGroupId {
  return (OSF_OPTIONAL_COLUMN_GROUPS as readonly string[]).includes(id);
}

export function normalizeOptionalColumnGroups(ids: string[]): OsfOptionalColumnGroupId[] {
  const out: OsfOptionalColumnGroupId[] = [];
  for (const id of ids) {
    if (isOptionalColumnGroup(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function columnGroupSet(groups: OsfColumnGroupId[]): Set<OsfColumnGroupId> {
  const set = new Set<OsfColumnGroupId>([OSF_COLUMN_GROUP_CORE]);
  for (const g of groups) {
    if (g === OSF_COLUMN_GROUP_CORE || isOptionalColumnGroup(g)) set.add(g);
  }
  return set;
}
