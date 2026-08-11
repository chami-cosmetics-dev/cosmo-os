import { NextRequest, NextResponse } from "next/server";

import { isAllocatedOwner } from "@/lib/customer-insight/ownership";
import { sendSms } from "@/lib/hutch-sms";
import {
  buildBirthdayWishMessage,
} from "@/lib/page-data/merchant-birthday-wish-message";
import { getMerchantDisplayName } from "@/lib/merchant-groups";
import {
  canAccessMerchantDashboard,
  isCompanyAdminRole,
} from "@/lib/merchant-role";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { birthdayWishSendSchema } from "@/lib/validation/merchant-dashboard";

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roleNames = (context.roleNames ?? []) as string[];
  const allowed =
    canAccessMerchantDashboard(roleNames) ||
    hasPermission(context, "dashboard.merchant_view");
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const companyId = context.user.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: context.user.id },
    select: { couponCodes: true },
  });
  const couponCodes = dbUser?.couponCodes ?? null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = birthdayWishSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id: parsed.data.contactId, companyId },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      assignedMerchant: true,
    },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const viewerIsAdmin = isCompanyAdminRole(roleNames);
  if (
    !viewerIsAdmin &&
    !isAllocatedOwner(
      {
        knownName: context.user.knownName,
        name: context.user.name,
        email: context.user.email,
        roleNames,
        couponCodes,
      },
      contact.assignedMerchant,
    )
  ) {
    return NextResponse.json(
      { error: "You can only wish customers allocated to you" },
      { status: 403 },
    );
  }

  const phone = (parsed.data.phoneNumber || contact.phoneNumber || "").trim();
  if (!phone) {
    return NextResponse.json(
      { error: "Contact has no phone number" },
      { status: 400 },
    );
  }

  // One birthday wish per contact phone per calendar year (marker in message)
  const yearStart = new Date(`${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`);
  const prior = await prisma.smsLog.findFirst({
    where: {
      companyId,
      phoneNumber: { contains: phone.replace(/\D/g, "").slice(-9) },
      message: { contains: "[BDWISH]" },
      status: "success",
      sentAt: { gte: yearStart },
    },
    select: { id: true, sentAt: true },
  });
  if (prior) {
    return NextResponse.json(
      {
        error: "A birthday wish was already sent to this number this year",
        sentAt: prior.sentAt.toISOString(),
      },
      { status: 409 },
    );
  }

  const merchantName = getMerchantDisplayName(context.user);
  const message =
    parsed.data.message?.trim() ||
    buildBirthdayWishMessage({
      customerName: contact.name,
      merchantName,
      discountPercent: parsed.data.discountPercent,
      code: parsed.data.discountCode ?? null,
    });

  // Ensure marker for dedupe even if user edited message
  const finalMessage = message.includes("[BDWISH]")
    ? message
    : `${message.trim()} [BDWISH]`;

  const result = await sendSms(companyId, phone, finalMessage, context.user.id);
  if (!result.success) {
    return NextResponse.json(
      { error: result.message || "Failed to send SMS" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    contactId: contact.id,
    phoneNumber: phone,
  });
}
