import { brandFromAdaptLineItem } from "@/lib/customer-insight/brand";
import { brandsMatch } from "@/lib/customer-insight/brand";
import { extractCityFromAddress } from "@/lib/customer-insight/city";
import { prisma } from "@/lib/prisma";

export type FilterOptionDto = { value: string; label: string; sku?: string | null };

const JUNK_ITEM_TOKENS = new Set([
  "coupon",
  "coupons",
  "gift card",
  "giftcard",
  "gift cards",
  "shipping",
  "tip",
]);

/** Drop discount/coupon/gift-card rows that are not real catalog products. */
export function isNonProductInsightItem(input: {
  title?: string | null;
  variant?: string | null;
  sku?: string | null;
  productType?: string | null;
}): boolean {
  const title = (input.title ?? "").trim();
  const variant = (input.variant ?? "").trim();
  const sku = (input.sku ?? "").trim();
  const productType = (input.productType ?? "").trim();
  const fields = [title, variant, sku, productType];
  for (const field of fields) {
    const key = field.toLowerCase();
    if (JUNK_ITEM_TOKENS.has(key)) return true;
  }
  const blob = fields.join(" ").toLowerCase();
  if (/\bcoupon(s)?\b/.test(blob)) return true;
  if (/\bgift[\s-]?cards?\b/.test(blob)) return true;
  if (/^\d+$/.test(title) && (!variant || JUNK_ITEM_TOKENS.has(variant.toLowerCase()))) {
    return true;
  }
  return false;
}

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
      productType: true,
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
    pushUnique(seen, cities, row.city ?? "");
  }
  const needle = q?.trim().toLowerCase();
  if (!needle) return cities;
  return cities.filter((c) => c.label.toLowerCase().includes(needle));
}
