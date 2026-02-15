import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const createSecretSchema = z.object({
  secret: z
    .string()
    .min(LIMITS.shopifyWebhookSecret.min, "Secret must be at least 32 characters")
    .max(LIMITS.shopifyWebhookSecret.max, "Secret too long"),
  name: z.string().max(LIMITS.shopifyWebhookSecretName.max).optional(),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return secret.slice(0, 4) + "••••••••" + secret.slice(-4);
}

export async function GET() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const secrets = await prisma.shopifyWebhookSecret.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      secret: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    secrets.map((s) => ({
      id: s.id,
      name: s.name,
      secretMasked: maskSecret(s.secret),
      createdAt: s.createdAt,
    }))
  );
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSecretSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const secret = await prisma.shopifyWebhookSecret.create({
    data: {
      companyId,
      secret: parsed.data.secret.trim(),
      name: parsed.data.name?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      secret: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      id: secret.id,
      name: secret.name,
      secretMasked: maskSecret(secret.secret),
      createdAt: secret.createdAt,
    },
    { status: 201 }
  );
}
