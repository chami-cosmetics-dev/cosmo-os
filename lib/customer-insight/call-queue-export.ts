import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { formatAppIsoDate } from "@/lib/format-datetime";

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
        },
      },
    },
  });

  const sheetRows = rows.map((row) => ({
    Merchant: row.merchantLabel,
    Name: row.contact.name,
    Phone: row.contact.phoneNumber ?? "",
    "Assigned at": row.assignedAt.toISOString(),
    "Queue status": row.status,
    Category: row.contact.category ?? "",
    "Completed at": row.completedAt?.toISOString() ?? "",
    Assigner: row.assignedBy?.name || row.assignedBy?.email || "",
  }));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    sheetRows.length > 0
      ? sheetRows
      : [
          {
            Merchant: "",
            Name: "",
            Phone: "",
            "Assigned at": "",
            "Queue status": "",
            Category: "",
            "Completed at": "",
            Assigner: "",
          },
        ]
  );
  XLSX.utils.book_append_sheet(workbook, sheet, "Assignments");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `call-queue-assignments-${formatAppIsoDate(new Date())}.xlsx`;
  return { buffer, filename };
}
