import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { hasPermission, requireUserContext } from "@/lib/rbac";
import {
  EXCLUDED_SKU_WILDCARD,
  excludedSkuPrefixOf,
  excludingRuleOf,
  parseExcludedSkus,
  skuKey,
} from "@/lib/stock-health/calc";
import type { StockHealthExcludedSkuDto } from "@/lib/stock-health/config";
import { listRuleMatches } from "@/lib/stock-health/weekly-summary";

export const dynamic = "force-dynamic";

const addBodySchema = z.object({
  skus: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(100)
        .refine(
          (sku) => !sku.slice(0, -1).includes(EXCLUDED_SKU_WILDCARD) && sku !== EXCLUDED_SKU_WILDCARD,
          { message: "* is only allowed at the end, after some text (e.g. BU0*)" },
        ),
    )
    .min(1)
    .max(500),
});

async function authorize(permission: string) {
  const auth = await requireUserContext();
  if (!auth.ok) {
    return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  if (!hasPermission(auth.context, permission)) {
    return { error: NextResponse.json({ error: "Permission denied" }, { status: 403 }) };
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return {
      error: NextResponse.json(
        { error: "No company associated with your account" },
        { status: 404 },
      ),
    };
  }
  return { companyId };
}

async function listExcluded(companyId: string): Promise<StockHealthExcludedSkuDto[]> {
  const rows = await prisma.stockHealthExcludedSku.findMany({
    where: { companyId },
    orderBy: { sku: "asc" },
    select: { sku: true, createdAt: true, countAnyway: true },
  });
  const excluded = parseExcludedSkus(rows.map((row) => row.sku));
  return rows.map((row) => ({
    sku: row.sku,
    createdAt: row.createdAt.toISOString(),
    rule: excludedSkuPrefixOf(row.sku) === null ? excludingRuleOf(row.sku, excluded) : null,
    countAnyway: row.countAnyway,
  }));
}

export async function GET() {
  const auth = await authorize("purchasing.stock_health.read");
  if ("error" in auth) return auth.error;
  return NextResponse.json({ skus: await listExcluded(auth.companyId) });
}

/**
 * Adds Common SKUs or prefix rules (`BU0*`), upper-cased; ones already excluded are ignored,
 * counted-anyway ones are excluded again. `added` counts only what was typed, not the SKUs a
 * new rule lists.
 */
export async function POST(request: NextRequest) {
  const auth = await authorize("purchasing.stock_health.manage");
  if ("error" in auth) return auth.error;

  const parsed = addBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Validation failed",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const skus = [...new Set(parsed.data.skus.map(skuKey))];
  const reExcluded = await prisma.stockHealthExcludedSku.updateMany({
    where: { companyId: auth.companyId, sku: { in: skus }, countAnyway: true },
    data: { countAnyway: false },
  });
  const created = await prisma.stockHealthExcludedSku.createMany({
    data: skus.map((sku) => ({ companyId: auth.companyId, sku })),
    skipDuplicates: true,
  });
  await listRuleMatches(auth.companyId);
  return NextResponse.json({
    added: created.count + reExcluded.count,
    skus: await listExcluded(auth.companyId),
  });
}

/**
 * `?sku=` — counts one Common SKU again. A SKU a rule (`BU0*`) matches stays in the list as
 * counted anyway, so the rule does not exclude it again. Removing a rule also removes the
 * SKUs it listed (and its exceptions).
 */
export async function DELETE(request: NextRequest) {
  const auth = await authorize("purchasing.stock_health.manage");
  if ("error" in auth) return auth.error;

  const sku = skuKey(request.nextUrl.searchParams.get("sku") ?? "");
  if (!sku) return NextResponse.json({ error: "sku is required" }, { status: 400 });

  const prefix = excludedSkuPrefixOf(sku);
  if (prefix === null) {
    const rule = (await listExcluded(auth.companyId)).find((row) => row.sku === sku)?.rule;
    if (rule) {
      await prisma.stockHealthExcludedSku.updateMany({
        where: { companyId: auth.companyId, sku },
        data: { countAnyway: true },
      });
    } else {
      await prisma.stockHealthExcludedSku.deleteMany({ where: { companyId: auth.companyId, sku } });
    }
  } else {
    await prisma.stockHealthExcludedSku.deleteMany({
      where: { companyId: auth.companyId, OR: [{ sku }, { sku: { startsWith: prefix } }] },
    });
  }
  return NextResponse.json({ skus: await listExcluded(auth.companyId) });
}
