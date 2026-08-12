import { brandFromAdaptLineItem, lineMatchesBrand, textContainsBrandWord } from "@/lib/customer-insight/brand";
import { cityForDisplay, extractCityFromAddress } from "@/lib/customer-insight/city";
import { isNonProductInsightItem } from "@/lib/customer-insight/item-junk";
import { prisma } from "@/lib/prisma";

export type FilterOptionDto = { value: string; label: string; sku?: string | null };

export { isNonProductInsightItem } from "@/lib/customer-insight/item-junk";

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
  if (
    isNonProductInsightItem({
      title: trimmedTitle,
      variant,
      sku,
    })
  ) {
    return;
  }
  const variantTrim = variant?.trim() || "";
  const canonical = variantTrim ? `${trimmedTitle} — ${variantTrim}` : trimmedTitle;
  const key = canonical.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  const skuTrim = sku?.trim() || null;
  out.push({ value: canonical, label: canonical, sku: skuTrim });
}

export function rankInsightItemOptions(
  items: FilterOptionDto[],
  q: string
): FilterOptionDto[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  const scored = items
    .map((item) => {
      const sku = (item.sku ?? "").toLowerCase();
      const label = item.label.toLowerCase();
      const value = item.value.toLowerCase();
      let rank = 99;
      if (sku.startsWith(needle)) rank = 0;
      else if (sku.includes(needle)) rank = 1;
      else if (label.startsWith(needle) || value.startsWith(needle)) rank = 2;
      else if (textContainsBrandWord(label, needle) || textContainsBrandWord(value, needle))
        rank = 3;
      return { item, rank };
    })
    .filter((row) => row.rank < 99);
  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const skuA = a.item.sku ?? "";
    const skuB = b.item.sku ?? "";
    if (a.rank <= 1 && skuA !== skuB) {
      return skuA.localeCompare(skuB, undefined, { sensitivity: "base" });
    }
    return a.item.label.localeCompare(b.item.label, undefined, { sensitivity: "base" });
  });
  return scored.map((row) => row.item);
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

const productItemSelect = {
  productTitle: true,
  variantTitle: true,
  sku: true,
  productType: true,
  vendor: { select: { name: true } },
} as const;

function productItemBaseWhere(companyId: string, brandNeedle: string | null) {
  const notCoupon = { NOT: { sku: { equals: "coupon", mode: "insensitive" as const } } };
  if (!brandNeedle) {
    return { companyId, ...notCoupon };
  }
  return {
    companyId,
    AND: [
      {
        OR: [
          { vendor: { name: { contains: brandNeedle, mode: "insensitive" as const } } },
          { productTitle: { contains: brandNeedle, mode: "insensitive" as const } },
        ],
      },
      notCoupon,
    ],
  };
}

function productItemVendorWhere(companyId: string, brandNeedle: string) {
  return {
    companyId,
    AND: [
      { vendor: { name: { contains: brandNeedle, mode: "insensitive" as const } } },
      { NOT: { sku: { equals: "coupon", mode: "insensitive" as const } } },
    ],
  };
}

export async function listInsightItemOptions(
  companyId: string,
  input: { brand?: string; q?: string }
): Promise<FilterOptionDto[]> {
  const brandNeedle = input.brand?.trim() || null;
  const qNeedle = input.q?.trim() || null;
  const seen = new Set<string>();
  const items: FilterOptionDto[] = [];
  const productWhere = productItemBaseWhere(companyId, brandNeedle);
  const searchOr = qNeedle
    ? {
        OR: [
          { sku: { contains: qNeedle, mode: "insensitive" as const } },
          { productTitle: { contains: qNeedle, mode: "insensitive" as const } },
        ],
      }
    : null;

  const [skuPrefixProducts, vendorProducts, products] = await Promise.all([
    qNeedle
      ? prisma.productItem.findMany({
          where: {
            AND: [
              productWhere,
              { sku: { startsWith: qNeedle, mode: "insensitive" } },
            ],
          },
          select: productItemSelect,
          take: 300,
          orderBy: { sku: "asc" },
        })
      : Promise.resolve([]),
    brandNeedle
      ? prisma.productItem.findMany({
          where: searchOr
            ? { AND: [productItemVendorWhere(companyId, brandNeedle), searchOr] }
            : productItemVendorWhere(companyId, brandNeedle),
          select: productItemSelect,
          take: 3_000,
          orderBy: { productTitle: "asc" },
        })
      : Promise.resolve([]),
    prisma.productItem.findMany({
      where: searchOr ? { AND: [productWhere, searchOr] } : productWhere,
      select: productItemSelect,
      take: 3_000,
      orderBy: { productTitle: "asc" },
    }),
  ]);

  for (const p of [...skuPrefixProducts, ...vendorProducts, ...products]) {
    if (
      brandNeedle &&
      !lineMatchesBrand(brandNeedle, {
        vendorName: p.vendor?.name,
        productTitle: p.productTitle,
      })
    ) {
      continue;
    }
    const title = (p.productTitle ?? "").trim() || "Unknown item";
    if (
      isNonProductInsightItem({
        title,
        variant: p.variantTitle,
        sku: p.sku,
        productType: p.productType,
      })
    ) {
      continue;
    }
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
      if (
        brandNeedle &&
        !lineMatchesBrand(brandNeedle, {
          vendorName: brandFromAdaptLineItem(raw),
          productTitle: title,
        })
      ) {
        continue;
      }
      const variant = String(obj.variantTitle ?? obj.variant ?? "").trim();
      const sku = String(obj.itemCode ?? obj.sku ?? "").trim();
      pushItemOption(seen, items, title, variant, sku);
    }
  }

  if (!qNeedle) {
    items.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return items.slice(0, 500);
  }
  return rankInsightItemOptions(items, qNeedle).slice(0, 500);
}

export async function listInsightCityOptions(
  companyId: string,
  q?: string
): Promise<FilterOptionDto[]> {
  const missing = await prisma.contactMaster.findMany({
    where: { companyId, city: null, address: { not: null } },
    select: { id: true, address: true },
    take: 400,
  });
  const pending: Array<{ id: string; city: string }> = [];
  for (const row of missing) {
    const city = extractCityFromAddress(row.address);
    if (!city) continue;
    pending.push({ id: row.id, city });
  }
  for (let i = 0; i < pending.length; i += 25) {
    const chunk = pending.slice(i, i + 25);
    await Promise.all(
      chunk.map((row) =>
        prisma.contactMaster.update({
          where: { id: row.id },
          data: { city: row.city },
        })
      )
    );
  }

  const rows = await prisma.contactMaster.findMany({
    where: { companyId, city: { not: null } },
    distinct: ["city"],
    select: { city: true },
    take: 800,
    orderBy: { city: "asc" },
  });
  const seen = new Set<string>();
  const cities: FilterOptionDto[] = [];
  for (const row of rows) {
    const city = cityForDisplay(row.city);
    if (!city) continue;
    pushUnique(seen, cities, city);
  }
  const needle = q?.trim().toLowerCase();
  if (!needle) return cities;
  return cities.filter((c) => c.label.toLowerCase().includes(needle));
}
