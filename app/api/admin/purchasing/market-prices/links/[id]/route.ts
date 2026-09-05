import { NextRequest, NextResponse } from "next/server";

import { validateCompetitorProductUrl } from "@/lib/market-prices/competitors";
import { parsePackSize } from "@/lib/market-prices/pack-size";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { marketPriceLinkUpdateSchema } from "@/lib/validation/market-prices";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requirePermission("purchasing.market_prices.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  const userId = context?.user?.id;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const existing = await prisma.marketCompetitorLink.findFirst({
    where: { id, companyId },
    include: { competitor: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  const parsed = marketPriceLinkUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Validate URL if supplied
  if (data.productUrl) {
    const urlCheck = validateCompetitorProductUrl(
      data.productUrl,
      existing.competitor.websiteDomain,
    );
    if (!urlCheck.valid) {
      return NextResponse.json({ error: urlCheck.warning || "Invalid URL" }, { status: 400 });
    }
  }

  // If price changed, create audit history row
  if (
    data.listedPriceLkr != null &&
    Number(existing.listedPriceLkr) !== Number(data.listedPriceLkr)
  ) {
    await prisma.marketCompetitorPriceHistory.create({
      data: {
        linkId: existing.id,
        listedPriceLkr: existing.listedPriceLkr,
        inStock: existing.inStock,
        checkDate: existing.checkDate,
        changedById: userId,
      },
    });
  }

  const updated = await prisma.marketCompetitorLink.update({
    where: { id: existing.id },
    data: {
      ...(data.productUrl ? { productUrl: data.productUrl } : {}),
      ...(data.competitorTitle ? { competitorTitle: data.competitorTitle } : {}),
      ...(data.competitorTitle
        ? { packSizeNormalized: parsePackSize(data.competitorTitle)?.normalized || null }
        : {}),
      ...(data.listedPriceLkr != null ? { listedPriceLkr: data.listedPriceLkr } : {}),
      ...(data.inStock !== undefined ? { inStock: data.inStock } : {}),
      ...(data.checkDate ? { checkDate: new Date(`${data.checkDate}T00:00:00Z`) } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      updatedById: userId,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = await requirePermission("purchasing.market_prices.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const existing = await prisma.marketCompetitorLink.findFirst({
    where: { id, companyId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  await prisma.marketCompetitorLink.delete({
    where: { id: existing.id },
  });

  return new NextResponse(null, { status: 204 });
}
