import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { smsPortalConfigUpdateSchema } from "@/lib/validation";

const HUTCH_AUTH_URL = "https://bsms.hutch.lk/api/login";
const HUTCH_SMS_URL = "https://bsms.hutch.lk/api/sendsms";

export async function GET() {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (!user?.companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const config = await prisma.smsPortalConfig.findUnique({
    where: { companyId: user.companyId },
    select: {
      id: true,
      username: true,
      authUrl: true,
      smsUrl: true,
      smsMask: true,
      campaignName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!config) {
    return NextResponse.json({
      id: null,
      username: "",
      authUrl: HUTCH_AUTH_URL,
      smsUrl: HUTCH_SMS_URL,
      smsMask: "",
      campaignName: "General",
      hasPassword: false,
    });
  }

  return NextResponse.json({
    ...config,
    hasPassword: true,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (!user?.companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = smsPortalConfigUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { username, password, authUrl, smsUrl, smsMask, campaignName } =
    parsed.data;

  const existing = await prisma.smsPortalConfig.findUnique({
    where: { companyId: user.companyId },
    select: { password: true },
  });

  const passwordToUse =
    password !== undefined && password !== ""
      ? password
      : existing?.password ?? "";

  if (!existing && !password) {
    return NextResponse.json(
      { error: "Password is required when creating new configuration" },
      { status: 400 }
    );
  }

  await prisma.smsPortalConfig.upsert({
    where: { companyId: user.companyId },
    create: {
      companyId: user.companyId,
      username,
      password: passwordToUse,
      authUrl,
      smsUrl,
      smsMask,
      campaignName,
    },
    update: {
      username,
      ...(password !== undefined && password !== "" && { password }),
      authUrl,
      smsUrl,
      smsMask,
      campaignName,
    },
  });

  return NextResponse.json({ success: true });
}
