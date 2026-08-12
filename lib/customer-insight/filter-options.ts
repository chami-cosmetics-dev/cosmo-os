import { brandFromAdaptLineItem } from "@/lib/customer-insight/brand";
import { brandsMatch } from "@/lib/customer-insight/brand";
import { prisma } from "@/lib/prisma";

export type FilterOptionDto = { value: string; label: string; sku?: string | null };

function pushUnique(
  seen: Set<string>,
  out: FilterOptionDto[],
  label: string
) {
  const trimmed = label.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ value: trimmed, label: trimmed });
}

function pushItemOption(
  seen: Set<string>,
  out: FilterOptionDto[],
  title: string,
  variant?: string | null,
  sku?: string | null
) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return;
  const variantTrim = variant?.trim() || "";
  const canonical = variantTrim ? `${trimmedTitle} — ${variantTrim}` : trimmedTitle;
  const key = canonical.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  const skuTrim = sku?.trim() || null;
  const label = skuTrim ? `${canonical} · ${skuTrim}` : canonical;
  out.push({ value: canonical, label, sku: skuTrim });
}

export async function listInsightBrandOptions(
  companyId: string,
  q?: string
): Promise<FilterOptionDto[]> {
  const [brandConfigs, vendors] = await Promise.all([
    prisma.dashboardBrandConfig.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    prisma.vendor.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  const seen = new Set<string>();
  const brands: FilterOptionDto[] = [];
  for (const name of [
    ...brandConfigs.map((b) => b.name),
    ...vendors.map((v) => v.name),
  ]) {
    pushUnique(seen, brands, name);
  }
  brands.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const needle = q?.trim().toLowerCase();
  if (!needle) return brands;
  return brands.filter((b) => b.label.toLowerCase().includes(needle));
}

export async function listInsightItemOptions(
  companyId: string,
  input: { brand?: string; q?: string }
): Promise<FilterOptionDto[]> {
  const brandNeedle = input.brand?.trim() || null;
  const seen = new Set<string>();
  const items: FilterOptionDto[] = [];

  const productWhere = brandNeedle
    ? {
        companyId,
        OR: [
          { vendor: { name: { equals: brandNeedle, mode: "insensitive" as const } } },
          { productTitle: { contains: brandNeedle, mode: "insensitive" as const } },
        ],
      }
    : { companyId };

  const products = await prisma.productItem.findMany({
    where: productWhere,
    select: {
      productTitle: true,
      variantTitle: true,
      sku: true,
      vendor: { select: { name: true } },
    },
    take: 3_000,
    orderBy: { productTitle: "asc" },
  });

  for (const p of products) {
    if (
      brandNeedle &&
      !brandsMatch(p.vendor?.name, brandNeedle) &&
      !(p.productTitle ?? "").toLowerCase().includes(brandNeedle.toLowerCase())
    ) {
      continue;
    }
    const title = (p.productTitle ?? "").trim() || "Unknown item";
    pushItemOption(seen, items, title, p.variantTitle, p.sku);
  }

  const adaptRows = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId },
    select: { lineItems: true },
    take: 2_000,
  });
  for (const row of adaptRows) {
    const lines = Array.isArray(row.lineItems) ? row.lineItems : [];
    for (const raw of lines) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const title = String(obj.itemName ?? obj.productTitle ?? obj.name ?? "").trim();
      if (!title) continue;
      if (brandNeedle) {
        const b = brandFromAdaptLineItem(raw);
        if (!brandsMatch(b, brandNeedle)) continue;
      }
      const variant = String(obj.variantTitle ?? obj.variant ?? "").trim();
      const sku = String(obj.itemCode ?? obj.sku ?? "").trim();
      pushItemOption(seen, items, title, variant, sku);
    }
  }

  items.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  const needle = input.q?.trim().toLowerCase();
  if (!needle) return items.slice(0, 500);
  return items
    .filter(
      (i) =>
        i.label.toLowerCase().includes(needle) ||
        i.value.toLowerCase().includes(needle) ||
        (i.sku?.toLowerCase().includes(needle) ?? false)
    )
    .slice(0, 500);
}
