import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildPhoneLookupVariants,
  extractAddressFromShippingJson,
  pickNameFromShippingJson,
} from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const querySchema = z.object({
  phone: trimmedString(1, LIMITS.mobile.max),
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.create_manual");
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

  const raw = request.nextUrl.searchParams.get("phone") ?? "";
  const parsed = querySchema.safeParse({ phone: raw });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const phone = parsed.data.phone;
  const variants = buildPhoneLookupVariants(phone);
  if (variants.length === 0) {
    return NextResponse.json({ found: false });
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { companyId, phoneNumber: { in: variants } },
    select: { id: true, name: true, email: true, phoneNumber: true },
  });

  const extraVariants = contact?.phoneNumber
    ? buildPhoneLookupVariants(contact.phoneNumber)
    : [];
  const orderPhoneVariants = [...new Set([...variants, ...extraVariants])];

  const orderOr: Prisma.OrderWhereInput[] = [];
  if (orderPhoneVariants.length > 0) {
    orderOr.push({ customerPhone: { in: orderPhoneVariants } });
  }
  if (contact?.email?.trim()) {
    orderOr.push({
      customerEmail: { equals: contact.email.trim(), mode: "insensitive" },
    });
  }

  let order: {
    name: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    shippingAddress: unknown;
  } | null = null;

  if (orderOr.length > 0) {
    order = await prisma.order.findFirst({
      where: { companyId, OR: orderOr },
      orderBy: { createdAt: "desc" },
      select: {
        name: true,
        customerEmail: true,
        customerPhone: true,
        shippingAddress: true,
      },
    });
  }

  if (!contact && !order) {
    return NextResponse.json({ found: false });
  }

  const addr = order ? extractAddressFromShippingJson(order.shippingAddress) : { address1: "", city: "" };
  const nameFromShipping = order ? pickNameFromShippingJson(order.shippingAddress) : "";

  let customerName = "";
  let customerEmail: string | null = null;

  if (contact) {
    customerName = contact.name;
    customerEmail = contact.email;
  } else if (order) {
    customerName = order.name?.trim() || nameFromShipping || "";
    customerEmail = order.customerEmail;
  }

  const source: "contact" | "order" | "both" =
    contact && order ? "both" : contact ? "contact" : "order";

  return NextResponse.json({
    found: true,
    source,
    contact,
    customerName,
    customerEmail,
    shippingAddressLine1: addr.address1 || null,
    shippingCity: addr.city || null,
  });
}
