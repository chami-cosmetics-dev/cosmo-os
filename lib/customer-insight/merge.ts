import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";

/**
 * Merge source ContactMaster into target (same company).
 * Moves phones/emails/updates/adapt rows; deletes source.
 */
export async function mergeContactMasters(input: {
  companyId: string;
  sourceContactId: string;
  targetContactId: string;
  actorUserId: string | null | undefined;
}): Promise<{ contactId: string }> {
  const { companyId, sourceContactId, targetContactId, actorUserId } = input;
  if (sourceContactId === targetContactId) {
    throw new Error("SOURCE_EQUALS_TARGET");
  }

  const [source, target] = await Promise.all([
    prisma.contactMaster.findFirst({
      where: { id: sourceContactId, companyId },
      include: { phones: true, emails: true },
    }),
    prisma.contactMaster.findFirst({
      where: { id: targetContactId, companyId },
      include: { phones: true, emails: true },
    }),
  ]);

  if (!source || !target) {
    throw new Error("NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    for (const phone of source.phones) {
      const exists = target.phones.some(
        (p) => p.phoneNumber === phone.phoneNumber
      );
      if (exists) {
        await tx.contactPhone.delete({ where: { id: phone.id } });
      } else {
        await tx.contactPhone.update({
          where: { id: phone.id },
          data: { contactId: target.id, isPrimary: false },
        });
      }
    }

    for (const email of source.emails) {
      const exists = target.emails.some((e) => e.email === email.email);
      if (exists) {
        await tx.contactEmail.delete({ where: { id: email.id } });
      } else {
        await tx.contactEmail.update({
          where: { id: email.id },
          data: { contactId: target.id, isPrimary: false },
        });
      }
    }

    // If target missing primary phone/email, prefer source primary fields.
    await tx.contactMaster.update({
      where: { id: target.id },
      data: {
        phoneNumber: target.phoneNumber || source.phoneNumber,
        email: target.email || source.email,
        birthYear: target.birthYear ?? source.birthYear,
        birthMonth: target.birthMonth ?? source.birthMonth,
        birthDay: target.birthDay ?? source.birthDay,
        assignedMerchant: target.assignedMerchant || source.assignedMerchant,
      },
    });

    await tx.contactAllocationUpdate.updateMany({
      where: { companyId, contactId: source.id },
      data: { contactId: target.id },
    });

    await tx.adaptPurchaseHistory.updateMany({
      where: { companyId, contactId: source.id },
      data: { contactId: target.id },
    });

    await tx.contactMaster.delete({ where: { id: source.id } });
  });

  await writeAuditLog({
    companyId,
    actorUserId: actorUserId ?? undefined,
    module: "customer-insight",
    action: "contact_merged",
    entityType: "ContactMaster",
    entityId: target.id,
    summary: `Merged contact ${source.name} (${source.id}) into ${target.name} (${target.id})`,
    beforeData: {
      sourceId: source.id,
      sourceName: source.name,
      sourcePhone: source.phoneNumber,
    },
    afterData: {
      targetId: target.id,
      targetName: target.name,
      targetPhone: target.phoneNumber,
    },
  });

  return { contactId: target.id };
}
