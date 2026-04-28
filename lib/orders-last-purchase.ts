import { normalizeContactEmail, normalizeContactPhone } from "@/lib/contact-identifiers";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

export async function getLatestOrderPurchaseAt(
  companyId: string,
  email?: string | null,
  phoneNumber?: string | null
) {
  const normalizedEmail = normalizeContactEmail(email);
  const normalizedPhone = normalizeContactPhone(phoneNumber);
  if (!normalizedEmail && !normalizedPhone) return null;

  const phoneValues = normalizedPhone ? buildPhoneLookupVariants(normalizedPhone) : [];

  const order = await prisma.order.findFirst({
    where: {
      companyId,
      OR: [
        ...(normalizedEmail
          ? [{ customerEmail: { equals: normalizedEmail, mode: "insensitive" as const } }]
          : []),
        ...(phoneValues.length > 0 ? [{ customerPhone: { in: phoneValues } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return order?.createdAt ?? null;
}
