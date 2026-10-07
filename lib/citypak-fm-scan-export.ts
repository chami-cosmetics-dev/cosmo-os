import { CITYPAK_WAYBILL_SOURCE } from "@/lib/citypak-api";
import {
  CITYPAK_FM_SCAN_MAX_RANGE_DAYS,
  CITYPAK_FM_SCAN_MAX_ROWS,
  buildCitypakFmScanCsv,
  type CitypakFmScanWaybill,
} from "@/lib/citypak-fm-scan";
import { parseAppCalendarDayEnd, parseAppCalendarDayStart } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

export type CitypakFmScanExportResult =
  | { ok: true; csv: string; rowCount: number; filename: string }
  | { ok: false; error: string; status: number };

export async function exportCitypakFmScan(input: {
  companyId: string;
  from: string;
  to: string;
}): Promise<CitypakFmScanExportResult> {
  const start = parseAppCalendarDayStart(input.from);
  const end = parseAppCalendarDayEnd(input.to);
  if (!start || !end || start.getTime() > end.getTime()) {
    return { ok: false, status: 400, error: "From date must be on or before to date." };
  }

  const spanDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (spanDays > CITYPAK_FM_SCAN_MAX_RANGE_DAYS) {
    return {
      ok: false,
      status: 400,
      error: `Date range cannot exceed ${CITYPAK_FM_SCAN_MAX_RANGE_DAYS} days.`,
    };
  }

  const where = {
    companyId: input.companyId,
    source: CITYPAK_WAYBILL_SOURCE,
    createdAt: { gte: start, lte: end },
  };

  const rowCount = await prisma.orderWaybill.count({ where });
  if (rowCount > CITYPAK_FM_SCAN_MAX_ROWS) {
    return {
      ok: false,
      status: 400,
      error: `That range has ${rowCount} waybills. Narrow it below ${CITYPAK_FM_SCAN_MAX_ROWS}.`,
    };
  }

  const rows = await prisma.orderWaybill.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { waybillNo: "asc" }],
    select: {
      waybillNo: true,
      invoiceNumber: true,
      createdAt: true,
      rawPayload: true,
    },
  });

  const waybills: CitypakFmScanWaybill[] = rows.map((row) => ({
    waybillNo: row.waybillNo,
    invoiceNumber: row.invoiceNumber,
    createdAt: row.createdAt,
    rawPayload: row.rawPayload,
  }));

  return {
    ok: true,
    csv: buildCitypakFmScanCsv(waybills),
    rowCount: waybills.length,
    filename: `fm_scan-${input.from}-to-${input.to}.csv`,
  };
}
