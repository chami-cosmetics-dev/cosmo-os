import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

// Returns aggregated ContactAllocationUpdate counts grouped by merchantName and
// category, used to power the Call Center Performance Analysis chart on the
// dashboard. Optional `from` / `to` query params filter by createdAt date.

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["contacts.allocation.read", "contacts.read"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Dashboard date strings are "YYYY-MM-DD" in Asia/Colombo (UTC+05:30).
  // Append explicit Colombo offsets so the day boundaries are correct —
  // without this, new Date("2026-05-19") = midnight UTC which misses all
  // records created during the Colombo business day.
  const fromDate = fromParam ? new Date(`${fromParam}T00:00:00+05:30`) : null;
  const toDate   = toParam   ? new Date(`${toParam}T23:59:59.999+05:30`) : null;

  if (fromDate && Number.isNaN(fromDate.getTime())) {
    return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  }
  if (toDate && Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
  }

  const rows = await prisma.$queryRaw<
    Array<{ merchantName: string | null; category: string | null; count: bigint }>
  >(
    Prisma.sql`
      SELECT
        "merchantName",
        "category",
        COUNT(*) AS "count"
      FROM "ContactAllocationUpdate"
      WHERE "companyId" = ${companyId}
        AND (${fromDate}::timestamptz IS NULL OR "createdAt" >= ${fromDate})
        AND (${toDate}::timestamptz IS NULL OR "createdAt" <= ${toDate})
      GROUP BY "merchantName", "category"
      ORDER BY "merchantName" ASC, "count" DESC
    `
  );

  // Convert BigInt counts to numbers for JSON serialisation
  const data = rows.map((row) => ({
    merchantName: row.merchantName ?? "Unknown",
    category: row.category ?? "N/A",
    count: Number(row.count),
  }));

  return NextResponse.json({ data });
}
