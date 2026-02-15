import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";

import { prisma } from "@/lib/prisma";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { shopifyProductWebhookSchema } from "@/lib/validation/shopify-product";
import { LIMITS } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  const locationIdParam = request.nextUrl.searchParams.get("location_id");
  if (!locationIdParam?.trim()) {
    return NextResponse.json(
      { error: "location_id query param is required" },
      { status: 400 }
    );
  }

  const locationId = locationIdParam.trim().slice(0, LIMITS.shopifyLocationId.max);

  const location = await prisma.companyLocation.findFirst({
    where: { shopifyLocationId: locationId },
    include: {
      company: {
        include: {
          shopifyWebhookSecrets: { select: { secret: true } },
        },
      },
    },
  });

  if (!location) {
    return NextResponse.json(
      { error: "Location not found for given shopify location id" },
      { status: 404 }
    );
  }

  const secrets = location.company.shopifyWebhookSecrets.map((s) => s.secret);
  if (secrets.length === 0) {
    return NextResponse.json(
      { error: "No webhook secrets configured for this company" },
      { status: 500 }
    );
  }

  const isValid = secrets.some((secret) =>
    verifyShopifyWebhook(rawBody, hmacHeader, secret)
  );
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = shopifyProductWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const companyId = location.companyId;

  const vendorName = (data.vendor ?? "").trim().slice(0, LIMITS.vendorName.max);
  const categoryNameRaw = data.category?.name ?? data.category?.full_name ?? "";
  const categoryName = categoryNameRaw.trim().slice(0, LIMITS.categoryName.max);

  let vendorId: string | null = null;
  if (vendorName) {
    const vendor = await prisma.vendor.upsert({
      where: {
        companyId_name: { companyId, name: vendorName },
      },
      create: { companyId, name: vendorName },
      update: {},
    });
    vendorId = vendor.id;
  }

  let categoryId: string | null = null;
  if (categoryName) {
    const categoryFullName = (data.category?.full_name ?? "").trim().slice(0, LIMITS.categoryFullName.max) || null;
    const category = await prisma.category.upsert({
      where: {
        companyId_name: { companyId, name: categoryName },
      },
      create: { companyId, name: categoryName, fullName: categoryFullName },
      update: { fullName: categoryFullName },
    });
    categoryId = category.id;
  }

  const productImage = data.image ?? data.images?.[0];
  const baseImageUrl = productImage?.src ?? null;

  for (const variant of data.variants) {
    const variantImage = data.images?.find((img) =>
      img.variant_ids?.includes(variant.id)
    );
    const imageUrl = (variantImage?.src ?? baseImageUrl)?.slice(0, 2000) ?? null;

    const price = new Decimal(variant.price);
    const compareAtPrice = variant.compare_at_price
      ? new Decimal(variant.compare_at_price)
      : null;

    await prisma.productItem.upsert({
      where: {
        companyLocationId_shopifyVariantId: {
          companyLocationId: location.id,
          shopifyVariantId: String(variant.id),
        },
      },
      create: {
        companyId,
        companyLocationId: location.id,
        shopifyLocationId: locationId,
        shopifyProductId: String(data.id),
        shopifyVariantId: String(variant.id),
        productTitle: data.title,
        variantTitle: variant.title?.slice(0, 255) ?? null,
        sku: variant.sku?.slice(0, LIMITS.sku.max) ?? null,
        price,
        compareAtPrice,
        vendorId,
        categoryId,
        status: data.status?.slice(0, 50) ?? null,
        productType: data.product_type?.slice(0, 200) ?? null,
        handle: data.handle?.slice(0, 255) ?? null,
        imageUrl,
        tags: data.tags?.slice(0, 1000) ?? null,
        barcode: variant.barcode?.slice(0, 100) ?? null,
        inventoryQuantity: variant.inventory_quantity ?? 0,
      },
      update: {
        productTitle: data.title,
        variantTitle: variant.title?.slice(0, 255) ?? null,
        sku: variant.sku?.slice(0, LIMITS.sku.max) ?? null,
        price,
        compareAtPrice,
        vendorId,
        categoryId,
        status: data.status?.slice(0, 50) ?? null,
        productType: data.product_type?.slice(0, 200) ?? null,
        handle: data.handle?.slice(0, 255) ?? null,
        imageUrl,
        tags: data.tags?.slice(0, 1000) ?? null,
        barcode: variant.barcode?.slice(0, 100) ?? null,
        inventoryQuantity: variant.inventory_quantity ?? 0,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
