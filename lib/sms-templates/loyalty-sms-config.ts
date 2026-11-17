import { prisma } from "@/lib/prisma";

export async function getLoyaltySmsOfficePhone(companyId: string): Promise<string> {
  const row = await prisma.loyaltySmsConfig.findUnique({
    where: { companyId },
    select: { officeContactPhone: true },
  });
  return (row?.officeContactPhone ?? "").trim();
}

export async function upsertLoyaltySmsOfficePhone(
  companyId: string,
  officeContactPhone: string,
): Promise<string> {
  const phone = officeContactPhone.trim();
  const row = await prisma.loyaltySmsConfig.upsert({
    where: { companyId },
    create: { companyId, officeContactPhone: phone },
    update: { officeContactPhone: phone },
    select: { officeContactPhone: true },
  });
  return row.officeContactPhone;
}
