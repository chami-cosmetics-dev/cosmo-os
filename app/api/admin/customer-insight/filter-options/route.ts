import { NextRequest, NextResponse } from "next/server";

import {
  listInsightBrandOptions,
  listInsightCityOptions,
  listInsightItemOptions,
} from "@/lib/customer-insight/filter-options";
import { requirePermission } from "@/lib/rbac";
import { customerInsightFilterOptionsQuerySchema } from "@/lib/validation/customer-insight";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.insight.read");
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

  const sp = request.nextUrl.searchParams;
  const parsed = customerInsightFilterOptionsQuerySchema.safeParse({
    type: sp.get("type") ?? "brands",
    brand: sp.get("brand") ?? undefined,
    q: sp.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.type === "items") {
    const options = await listInsightItemOptions(companyId, {
      brand: parsed.data.brand,
      q: parsed.data.q,
    });
    return NextResponse.json({
      options,
      /** Back-compat: brands list empty when type=items */
      brands: [],
    });
  }

  if (parsed.data.type === "cities") {
    const options = await listInsightCityOptions(companyId, parsed.data.q);
    return NextResponse.json({
      options,
      brands: [],
    });
  }

  const options = await listInsightBrandOptions(companyId, parsed.data.q);
  return NextResponse.json({
    options,
    brands: options.map((o) => o.value),
  });
}
