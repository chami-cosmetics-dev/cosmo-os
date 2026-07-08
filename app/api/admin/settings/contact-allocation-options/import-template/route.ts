import { NextResponse } from "next/server";

import { buildCsv } from "@/lib/reports/csv";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission("contacts.allocation.settings");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const csv = buildCsv(
    ["S. Provider", "District", "Town", "Origin", "Category", "Cus. Type"],
    [
      {
        "S. Provider": "Dialog",
        District: "Colombo",
        Town: "Maharagama",
        Origin: "Website",
        Category: "Retail",
        "Cus. Type": "Regular",
      },
      {
        "S. Provider": "Mobitel",
        District: "Gampaha",
        Town: "Negombo",
        Origin: "Facebook",
        Category: "Wholesale",
        "Cus. Type": "VIP",
      },
    ]
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contact-allocation-options-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
