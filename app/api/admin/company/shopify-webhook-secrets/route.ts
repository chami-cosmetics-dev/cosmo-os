import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, LIMITS, pageSchema, trimmedString } from "@/lib/validation";

const createSecretSchema = z.object({
  secret: z
    .string()
    .min(LIMITS.shopifyWebhookSecret.min, "Secret must be at least 32 characters")
    .max(LIMITS.shopifyWebhookSecret.max, "Secret too long"),
  name: z.string().max(LIMITS.shopifyWebhookSecretName.max).optional(),
});

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return secret.slice(0, 4) + "••••••••" + secret.slice(-4);
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("settings.company");
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

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 10;
  const skip = (page - 1) * limit;

  const [total, secrets] = await Promise.all([
    prisma.shopifyWebhookSecret.count({ where: { companyId } }),
    prisma.shopifyWebhookSecret.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        secret: true,
        createdAt: true,
      },
    }),
  ]);

  const items = secrets.map((s) => ({
    id: s.id,
    name: s.name,
    secretMasked: maskSecret(s.secret),
    createdAt: s.createdAt,
  }));

  return NextResponse.json({ items, total, page, limit });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
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
