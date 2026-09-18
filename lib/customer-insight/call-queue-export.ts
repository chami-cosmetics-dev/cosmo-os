import * as XLSX from "xlsx";

import { uniqueContactPhones } from "@/lib/customer-insight/allocation-summary";
import {
  listCallQueueCandidates,
  type CallQueueAssignFilters,
} from "@/lib/customer-insight/call-queue";
import { prisma } from "@/lib/prisma";
import { formatAppIsoDate } from "@/lib/format-datetime";

/** Safety cap for filtered allocated-contact Excel export (no single merchant). */
export const CALL_QUEUE_FILTERED_EXPORT_CAP = 25_000;

function applyTextColumn(
  sheet: XLSX.WorkSheet,
  header: string,
  values: string[]
) {
  const ref = sheet["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  let col = -1;
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: C })];
    if (String(cell?.v ?? "") === header) {
      col = C;
      break;
    }
  }
  if (col < 0) return;
  for (let i = 0; i < values.length; i++) {
    const addr = XLSX.utils.encode_cell({ r: i + 1, c: col });
    sheet[addr] = { t: "s", v: values[i] ?? "", z: "@" };
  }
}

export async function buildCallQueueAssignmentsWorkbook(input: {
  companyId: string;
  assignedMerchant?: string;
}): Promise<{ buffer: Buffer; filename: string }> {
  const rows = await prisma.contactInsightCallQueue.findMany({
    where: {
      companyId: input.companyId,
      ...(input.assignedMerchant
        ? {
            merchantLabel: {
              equals: input.assignedMerchant,
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    orderBy: { assignedAt: "desc" },
    select: {
      assignedAt: true,
      status: true,
      completedAt: true,
      merchantLabel: true,
      assignedBy: { select: { name: true, email: true } },
      contact: {
        select: {
          name: true,
          phoneNumber: true,
          category: true,
          phones: { select: { phoneNumber: true } },
        },
      },
    },
  });

  const emptyRow = {
    Merchant: "",
    Name: "",
    Phone: "",
    "Assigned at": "",
    "Queue status": "",
    Category: "",
    "Completed at": "",
    Assigner: "",
  };

  const sheetRows =
    rows.length > 0
      ? rows.map((row) => {
          const phones = uniqueContactPhones(
            row.contact.phoneNumber,
            row.contact.phones
          );
          return {
            Merchant: row.merchantLabel,
            Name: row.contact.name,
            Phone: phones.join("; "),
            "Assigned at": row.assignedAt.toISOString(),
            "Queue status": row.status,
            Category: row.contact.category ?? "",
            "Completed at": row.completedAt?.toISOString() ?? "",
            Assigner: row.assignedBy?.name || row.assignedBy?.email || "",
          };
        })
      : [emptyRow];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  applyTextColumn(
    sheet,
    "Phone",
    sheetRows.map((row) => row.Phone)
  );
  XLSX.utils.book_append_sheet(workbook, sheet, "Assignments");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `call-queue-assignments-${formatAppIsoDate(new Date())}.xlsx`;
  return { buffer, filename };
}

/** Filtered allocated contacts (same rules as Load allocated), merchant optional. */
export async function buildCallQueueFilteredContactsWorkbook(input: {
  companyId: string;
} & CallQueueAssignFilters): Promise<{ buffer: Buffer; filename: string }> {
  const pageSize = 100;
  const first = await listCallQueueCandidates({
    companyId: input.companyId,
    page: 1,
    pageSize,
    merchantValue: input.merchantValue,
    pushToGold: input.pushToGold,
    pushToPlatinum: input.pushToPlatinum,
    loyalty: input.loyalty,
    lastPurchaseFrom: input.lastPurchaseFrom,
    lastPurchaseTo: input.lastPurchaseTo,
    allocatedFrom: input.allocatedFrom,
    allocatedTo: input.allocatedTo,
    assignedFrom: input.assignedFrom,
    assignedTo: input.assignedTo,
    notContacted: input.notContacted,
    brands: input.brands,
    brand: input.brand,
    hideFilter: input.hideFilter ?? "all",
  });

  const total = Math.min(first.pagination.total, CALL_QUEUE_FILTERED_EXPORT_CAP);
  const items = [...first.items];
  const pageCount = Math.ceil(total / pageSize);
  for (let page = 2; page <= pageCount; page++) {
    const next = await listCallQueueCandidates({
      companyId: input.companyId,
      page,
      pageSize,
      merchantValue: input.merchantValue,
      pushToGold: input.pushToGold,
      pushToPlatinum: input.pushToPlatinum,
      loyalty: input.loyalty,
      lastPurchaseFrom: input.lastPurchaseFrom,
      lastPurchaseTo: input.lastPurchaseTo,
      allocatedFrom: input.allocatedFrom,
      allocatedTo: input.allocatedTo,
      assignedFrom: input.assignedFrom,
      assignedTo: input.assignedTo,
      notContacted: input.notContacted,
      brands: input.brands,
      brand: input.brand,
      hideFilter: input.hideFilter ?? "all",
    });
    items.push(...next.items);
    if (items.length >= CALL_QUEUE_FILTERED_EXPORT_CAP) break;
  }

  const capped = items.slice(0, CALL_QUEUE_FILTERED_EXPORT_CAP);
  const emptyRow = {
    Merchant: "",
    Name: "",
    Phone: "",
    "Lifetime total": "",
    "Last purchase": "",
    "Last contacted": "",
    Queued: "",
    Hidden: "",
    "Hide reason": "",
  };

  const sheetRows =
    capped.length > 0
      ? capped.map((row) => ({
          Merchant: row.assignedMerchant ?? "",
          Name: row.name,
          Phone: row.phoneNumber ?? "",
          "Lifetime total": row.lifetimeTotal,
          "Last purchase": row.lastPurchaseAt ?? "",
          "Last contacted": row.lastContactedAt ?? "",
          Queued: row.queued ? "yes" : "no",
          Hidden: row.hidden ? "yes" : "no",
          "Hide reason": row.hideReason ?? "",
        }))
      : [emptyRow];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  applyTextColumn(
    sheet,
    "Phone",
    sheetRows.map((row) => String(row.Phone ?? ""))
  );
  XLSX.utils.book_append_sheet(workbook, sheet, "Filtered");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `call-queue-filtered-${formatAppIsoDate(new Date())}.xlsx`;
  return { buffer, filename };
}
