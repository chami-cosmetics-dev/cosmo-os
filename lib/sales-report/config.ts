import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SALES_REPORT_DEFAULTS } from "./defaults";

export function validateSalesReportConfig(settings: Record<string, unknown>): string | null {
  const rows = settings.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 200) return "The template needs 1 to 200 merchant rows";
  const originalRows = new Map(SALES_REPORT_DEFAULTS.rows.map((row) => [row.row, row.outlet.toLowerCase()]));
  const positions = new Set<number>(), names = new Set<string>();
  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return "Invalid merchant row";
    const row = item as Record<string, unknown>;
    const position = Number(row.row), outlet = String(row.outlet ?? "").trim(), name = String(row.name ?? "").trim(), key = String(row.key ?? "").trim();
    if (!Number.isInteger(position) || position < 0 || !outlet || !name || !key) return "Each merchant needs an outlet, name, and sale name";
    if (position > 0 && originalRows.get(position) !== outlet.toLowerCase()) return "Existing template rows cannot be moved to another outlet";
    if (position > 0 && positions.has(position)) return "Duplicate template row";
    if (position > 0) positions.add(position);
    const identity = `${outlet.toLowerCase()}|${name.toLowerCase()}`;
    if (names.has(identity)) return "A merchant appears twice under the same outlet";
    names.add(identity);
    for (const field of ["showroomTarget", "onlineTarget"]) {
      const value = row[field];
      if (value != null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) return "Targets must be nonnegative numbers";
    }
  }
  const maps = settings.maps && typeof settings.maps === "object" && !Array.isArray(settings.maps) ? settings.maps as Record<string, unknown> : {};
  const warehouses = Array.isArray(maps.outletWarehouses) ? maps.outletWarehouses as unknown[][] : [];
  for (const item of rows as Array<Record<string, unknown>>) {
    const outlet = String(item.outlet).trim();
    if (Number(item.row) === 0 && outlet.toLowerCase() !== "online" && ![...originalRows.values()].includes(outlet.toLowerCase()) && !warehouses.some((pair) => String(pair?.[0] ?? "").toLowerCase() === outlet.toLowerCase() && String(pair?.[1] ?? "").trim())) return `Add a warehouse for ${outlet}`;
  }
  return null;
}

export async function loadSalesReportConfig(companyId: string): Promise<Record<string, unknown> | undefined> {
  const config = await prisma.salesReportConfig.findUnique({ where: { companyId }, select: { settings: true } });
  return config?.settings && typeof config.settings === "object" && !Array.isArray(config.settings)
    ? config.settings as Record<string, unknown>
    : undefined;
}

export async function saveSalesReportConfig(companyId: string, settings: Record<string, unknown>) {
  return prisma.salesReportConfig.upsert({
    where: { companyId },
    create: { companyId, settings: settings as Prisma.InputJsonValue },
    update: { settings: settings as Prisma.InputJsonValue },
  });
}
