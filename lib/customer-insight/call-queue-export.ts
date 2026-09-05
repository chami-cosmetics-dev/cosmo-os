import * as XLSX from "xlsx";

import { uniqueContactPhones } from "@/lib/customer-insight/allocation-summary";
import { prisma } from "@/lib/prisma";
import { formatAppIsoDate } from "@/lib/format-datetime";

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
