import "server-only";

import { prisma } from "@/lib/prisma";

export type OsfResolvedColumn = {
  id: string;
  key: string;
  label: string;
  companyLocationId: string | null;
  companyLocationName: string | null;
  /** ERP instance the warehouses live in (stock must be read from here) */
  erpnextInstanceId: string | null;
  /** Direct ERP warehouse names set on the column (overrides the location) */
  directWarehouses: string[];
  includeInStock: boolean;
  includeInRop: boolean;
  sortOrder: number;
  active: boolean;
  /** ERP warehouse names to query for this stock column */
  warehouses: string[];
};

/**
 * Resolve active OSF column configs → warehouse list via location ERP warehouses.
 */
export async function resolveOsfColumns(companyId: string): Promise<OsfResolvedColumn[]> {
  const columns = await prisma.osfColumnConfig.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: {
      companyLocation: {
        select: {
          id: true,
          name: true,
          shortName: true,
          erpnextInstanceId: true,
          erpnextWarehouse: true,
          erpWarehouses: { select: { warehouse: true } },
        },
      },
    },
  });

  return columns.map((col) => {
    const loc = col.companyLocation;
    const direct = (col.directWarehouses ?? []).map((w) => w.trim()).filter(Boolean);

    const warehouses = new Set<string>();
    if (direct.length > 0) {
      // Direct ERP targeting takes precedence over the mapped location.
      for (const wh of direct) warehouses.add(wh);
    } else {
      if (loc?.erpnextWarehouse?.trim()) warehouses.add(loc.erpnextWarehouse.trim());
      for (const wh of loc?.erpWarehouses ?? []) {
        const name = wh.warehouse?.trim();
        if (name) warehouses.add(name);
      }
    }

    return {
      id: col.id,
      key: col.key,
      label: col.label,
      companyLocationId: col.companyLocationId,
      companyLocationName: loc?.shortName || loc?.name || null,
      erpnextInstanceId: col.erpnextInstanceId ?? loc?.erpnextInstanceId ?? null,
      directWarehouses: direct,
      includeInStock: col.includeInStock,
      includeInRop: col.includeInRop,
      sortOrder: col.sortOrder,
      active: col.active,
      warehouses: [...warehouses],
    };
  });
}

export async function listOsfColumnsForApi(companyId: string) {
  const columns = await resolveOsfColumns(companyId);
  return columns.map((c) => ({
    id: c.id,
    key: c.key,
    label: c.label,
    companyLocationId: c.companyLocationId,
    companyLocationName: c.companyLocationName,
    erpnextInstanceId: c.erpnextInstanceId,
    directWarehouses: c.directWarehouses,
    warehouses: c.warehouses,
    includeInStock: c.includeInStock,
    includeInRop: c.includeInRop,
    sortOrder: c.sortOrder,
    active: c.active,
  }));
}
