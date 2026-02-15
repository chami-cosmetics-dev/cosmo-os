import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return secret.slice(0, 4) + "••••••••" + secret.slice(-4);
}

export async function GET() {
  const auth = await requirePermission("settings.company");
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

  const companyId = user.companyId;

  const [company, locations, departments, designations, secrets] =
    await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          employeeSize: true,
          address: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.companyLocation.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          address: true,
          shortName: true,
          invoiceHeader: true,
          invoiceSubHeader: true,
          invoiceFooter: true,
          invoicePhone: true,
          invoiceEmail: true,
          shopifyLocationId: true,
          shopifyShopName: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.department.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      }),
      prisma.designation.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      }),
      prisma.shopifyWebhookSecret.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, secret: true, createdAt: true },
      }),
    ]);

  return NextResponse.json({
    company: company ?? null,
    locations,
    departments,
    designations,
    shopifyWebhookSecrets: secrets.map((s) => ({
      id: s.id,
      name: s.name,
      secretMasked: maskSecret(s.secret),
      createdAt: s.createdAt,
    })),
  });
}
