import { prisma } from "@/lib/prisma";

export async function getLatestOrderPurchaseAt(
  companyId: string,
  email?: string | null,
  phoneNumber?: string | null
) {
  const normalizedEmail = email?.trim().toLowerCase() || null;
  const normalizedPhone = phoneNumber?.trim() || null;
  if (!normalizedEmail && !normalizedPhone) return null;

  const order = await prisma.order.findFirst({
    where: {
      companyId,
      OR: [
        ...(normalizedEmail
          ? [{ customerEmail: { equals: normalizedEmail, mode: "insensitive" as const } }]
          : []),
        ...(normalizedPhone ? [{ customerPhone: normalizedPhone }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return order?.createdAt ?? null;
}
