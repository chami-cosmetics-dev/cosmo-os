import { sendSms } from "@/lib/hutch-sms";
import { prisma } from "@/lib/prisma";
import {
  discountPercentForTier,
  purposeForLoyaltyTier,
  tierLabel,
} from "@/lib/sms-templates/catalog";
import { getLoyaltySmsOfficePhone } from "@/lib/sms-templates/loyalty-sms-config";
import { resolveAllocatedMerchantContact } from "@/lib/sms-templates/merchant-contact";
import { listMergedTemplatesForSend } from "@/lib/sms-templates/merge";
import {
  buildLoyaltyWishPlaceholderVars,
  renderSmsTemplatePlaceholders,
} from "@/lib/sms-templates/render";
import {
  filterActiveSmsTemplatePool,
  pickRandomSmsTemplate,
} from "@/lib/sms-templates/select";

export type LoyaltyWishTier = "gold" | "platinum";

export type LoyaltyWishSendStatus =
  | "success"
  | "skipped_no_phone"
  | "skipped_no_template"
  | "skipped_already_sent"
  | "failed";

export type LoyaltyWishSendResult = {
  status: LoyaltyWishSendStatus;
  templateKey: string | null;
  errorMessage?: string | null;
};

async function upsertWishRow(input: {
  companyId: string;
  contactId: string;
  tier: LoyaltyWishTier;
  status: LoyaltyWishSendStatus;
  templateKey?: string | null;
  phoneNumber?: string | null;
  messageBody?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  await prisma.loyaltyWishSend.upsert({
    where: {
      companyId_contactId_tier: {
        companyId: input.companyId,
        contactId: input.contactId,
        tier: input.tier,
      },
    },
    create: {
      companyId: input.companyId,
      contactId: input.contactId,
      tier: input.tier,
      status: input.status,
      templateKey: input.templateKey ?? null,
      phoneNumber: input.phoneNumber ?? null,
      messageBody: input.messageBody ?? null,
      errorMessage: input.errorMessage ?? null,
      sentAt: new Date(),
    },
    update: {
      status: input.status,
      templateKey: input.templateKey ?? null,
      phoneNumber: input.phoneNumber ?? null,
      messageBody: input.messageBody ?? null,
      errorMessage: input.errorMessage ?? null,
      sentAt: new Date(),
    },
  });
}

/**
 * Send loyalty-wish SMS after a new Gold/Platinum assignment.
 * Never throws — loyalty APIs must stay successful when SMS fails.
 */
export async function maybeSendLoyaltyWishSms(input: {
  companyId: string;
  contactId: string;
  tier: LoyaltyWishTier;
  actorUserId?: string | null;
}): Promise<LoyaltyWishSendResult> {
  try {
    const prior = await prisma.loyaltyWishSend.findUnique({
      where: {
        companyId_contactId_tier: {
          companyId: input.companyId,
          contactId: input.contactId,
          tier: input.tier,
        },
      },
      select: { status: true },
    });
    if (prior?.status === "success") {
      return { status: "skipped_already_sent", templateKey: null };
    }

    const contact = await prisma.contactMaster.findFirst({
      where: { id: input.contactId, companyId: input.companyId },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        assignedMerchant: true,
      },
    });
    if (!contact) {
      return { status: "failed", templateKey: null, errorMessage: "Contact not found" };
    }

    const phone = (contact.phoneNumber ?? "").trim();
    if (!phone) {
      await upsertWishRow({
        companyId: input.companyId,
        contactId: input.contactId,
        tier: input.tier,
        status: "skipped_no_phone",
      });
      return { status: "skipped_no_phone", templateKey: null };
    }

    const stored = await prisma.smsTemplate.findMany({
      where: { companyId: input.companyId },
      select: {
        id: true,
        key: true,
        name: true,
        purpose: true,
        body: true,
        active: true,
      },
    });
    const purpose = purposeForLoyaltyTier(input.tier);
    const pool = filterActiveSmsTemplatePool(listMergedTemplatesForSend(stored), purpose);
    const picked = pickRandomSmsTemplate(pool);
    if (!picked) {
      await upsertWishRow({
        companyId: input.companyId,
        contactId: input.contactId,
        tier: input.tier,
        status: "skipped_no_template",
        phoneNumber: phone,
      });
      return { status: "skipped_no_template", templateKey: null };
    }

    const merchant = await resolveAllocatedMerchantContact(
      input.companyId,
      contact.assignedMerchant,
    );
    const officePhone = await getLoyaltySmsOfficePhone(input.companyId);
    const vars = buildLoyaltyWishPlaceholderVars({
      customerName: contact.name,
      tier: tierLabel(input.tier),
      discountPercent: discountPercentForTier(input.tier),
      merchantName: merchant.merchantName,
      merchantPhone: merchant.merchantPhone,
      officePhone,
    });
    const messageBody = renderSmsTemplatePlaceholders(picked.body, vars).trim();
    if (!messageBody) {
      await upsertWishRow({
        companyId: input.companyId,
        contactId: input.contactId,
        tier: input.tier,
        status: "skipped_no_template",
        templateKey: picked.key,
        phoneNumber: phone,
      });
      return { status: "skipped_no_template", templateKey: picked.key };
    }

    const sendResult = await sendSms(
      input.companyId,
      phone,
      messageBody,
      input.actorUserId ?? undefined,
    );
    if (!sendResult.success) {
      await upsertWishRow({
        companyId: input.companyId,
        contactId: input.contactId,
        tier: input.tier,
        status: "failed",
        templateKey: picked.key,
        phoneNumber: phone,
        messageBody,
        errorMessage: sendResult.message || "SMS send failed",
      });
      return {
        status: "failed",
        templateKey: picked.key,
        errorMessage: sendResult.message || "SMS send failed",
      };
    }

    await upsertWishRow({
      companyId: input.companyId,
      contactId: input.contactId,
      tier: input.tier,
      status: "success",
      templateKey: picked.key,
      phoneNumber: phone,
      messageBody,
    });
    return { status: "success", templateKey: picked.key };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Loyalty wish SMS failed";
    console.error("[loyalty-wish-sms]", message, err);
    try {
      await upsertWishRow({
        companyId: input.companyId,
        contactId: input.contactId,
        tier: input.tier,
        status: "failed",
        errorMessage: message,
      });
    } catch (logErr) {
      console.error("[loyalty-wish-sms] failed to persist error row", logErr);
    }
    return { status: "failed", templateKey: null, errorMessage: message };
  }
}
