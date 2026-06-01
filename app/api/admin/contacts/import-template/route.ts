import { NextResponse } from "next/server";

import { buildCsv } from "@/lib/reports/csv";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission("contacts.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const csv = buildCsv(
    ["name", "email", "phone_number", "recent_merchant"],
    [
      {
        name: "Nimal Perera",
        email: "nimal@example.com",
        phone_number: "+94771234567",
        recent_merchant: "Chami",
      },
      {
        name: "Samanthi Silva",
        email: "",
        phone_number: "+94777654321",
        recent_merchant: "Netmi",
      },
    ]
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contact-import-sample.csv"',
      "Cache-Control": "no-store",
    },
  });
}
