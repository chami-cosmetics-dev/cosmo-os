import { NextResponse } from "next/server";

import { buildCsv } from "@/lib/reports/csv";
import { requireAnyPermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requireAnyPermission(["contacts.allocation.manage", "contacts.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const csv = buildCsv(
    ["phone_number", "allocated_merchant"],
    [
      {
        phone_number: "0771234567",
        allocated_merchant: "Chami",
      },
      {
        phone_number: "+94777654321",
        allocated_merchant: "Netmi",
      },
    ]
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contact-allocation-import.csv"',
      "Cache-Control": "no-store",
    },
  });
}
