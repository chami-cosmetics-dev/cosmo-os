import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import {
  findErpCustomerNameByPhone,
  getErpContactSyncInstances,
  setErpCustomerGroup,
} from "@/lib/erpnext-contact-sync";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import {
  applyShopifyLoyaltyTag,
  searchShopifyCustomerId,
  SHOPIFY_LOYALTY_TAG_GOLD,
  SHOPIFY_LOYALTY_TAG_PLATINUM,
} from "@/lib/shopify-admin";

export const ERP_LOYALTY_GROUP_GOLD = "Gold";
export const ERP_LOYALTY_GROUP_PLATINUM = "Platinum";

export function loyaltyExternalTargets(tier: "gold" | "platinum"): {
  erpGroup: string;
  shopifyTag: string;
  label: string;
} {
  if (tier === "platinum") {
    return {
      erpGroup: ERP_LOYALTY_GROUP_PLATINUM,
      shopifyTag: SHOPIFY_LOYALTY_TAG_PLATINUM,
      label: "Platinum",
    };
  }
  return {
    erpGroup: ERP_LOYALTY_GROUP_GOLD,
    shopifyTag: SHOPIFY_LOYALTY_TAG_GOLD,
    label: "Gold",
  };
}

export type LoyaltyPushResult = {
  erpUpdated: number;
  shopifyUpdated: number;
  errors: string[];
};

/**
 * Explicit assign send: ERP customer_group + Shopify loyalty tags.
 * Never called from automatic ERP→OS pull.
 */
export async function pushLoyaltyAssignmentToErpAndShopify(input: {
  companyId: string;
  contactId: string;
  tier: "gold" | "platinum";
}): Promise<LoyaltyPushResult> {
  const targets = loyaltyExternalTargets(input.tier);
  const errors: string[] = [];
  let erpUpdated = 0;
  let shopifyUpdated = 0;

  const contact = await prisma.contactMaster.findFirst({
    where: { id: input.contactId, companyId: input.companyId },
    select: { id: true, phoneNumber: true, email: true },
  });
  if (!contact) {
    return { erpUpdated: 0, shopifyUpdated: 0, errors: ["Contact not found"] };
  }

  const phones = await listContactPhones(contact.id, contact.phoneNumber);
  const emails = await listContactEmails(contact.id, contact.email);
  const primaryPhone = phones[0] ?? contact.phoneNumber;
  const primaryEmail = emails[0] ?? contact.email;

  const instances = await getErpContactSyncInstances(input.companyId);
  for (const instance of instances) {
    if (!primaryPhone) {
      errors.push(`${instance.slot}: no phone to match ERP Customer`);
      continue;
    }
    try {
      const name = await findErpCustomerNameByPhone(instance.cfg, primaryPhone);
      if (!name) {
        errors.push(`${instance.slot}: ERP Customer not found`);
        continue;
      }
      const ok = await setErpCustomerGroup(instance.cfg, name, targets.erpGroup);
      if (ok) erpUpdated += 1;
      else errors.push(`${instance.slot}: failed to set customer_group ${targets.erpGroup}`);
    } catch (err) {
      errors.push(
        `${instance.slot}: ${err instanceof Error ? err.message : "ERP update failed"}`
      );
    }
  }

  const handles = await prisma.companyLocation.findMany({
    where: {
      companyId: input.companyId,
      shopifyAdminStoreHandle: { not: null },
    },
    select: { shopifyAdminStoreHandle: true },
    distinct: ["shopifyAdminStoreHandle"],
  });
  const storeHandles = [
    ...new Set(
      handles
        .map((h) => h.shopifyAdminStoreHandle?.trim())
        .filter((h): h is string => Boolean(h))
    ),
  ];

  const phoneVariants = primaryPhone ? buildPhoneLookupVariants(primaryPhone) : [];
  const osCustomers = await prisma.customer.findMany({
    where: {
      companyId: input.companyId,
      OR: [
        ...(phoneVariants.length > 0 ? [{ phone: { in: phoneVariants } }] : []),
        ...(emails.length > 0
          ? emails.map((email) => ({
              email: { equals: email, mode: "insensitive" as const },
            }))
          : []),
      ],
    },
    select: { shopifyCustomerId: true },
    take: 20,
  });
  const shopifyIds = [
    ...new Set(osCustomers.map((c) => c.shopifyCustomerId).filter(Boolean)),
  ];

  for (const storeHandle of storeHandles) {
    try {
      let ids = [...shopifyIds];
      if (ids.length === 0) {
        const found = await searchShopifyCustomerId({
          storeHandle,
          phone: primaryPhone,
          email: primaryEmail,
        });
        if (found) ids = [found];
      }
      if (ids.length === 0) {
        errors.push(`Shopify ${storeHandle}: customer not found`);
        continue;
      }
      for (const shopifyCustomerId of ids) {
        const ok = await applyShopifyLoyaltyTag({
          storeHandle,
          shopifyCustomerId,
          tier: input.tier,
        });
        if (ok) shopifyUpdated += 1;
        else errors.push(`Shopify ${storeHandle}: tag update failed`);
      }
    } catch (err) {
      errors.push(
        `Shopify ${storeHandle}: ${err instanceof Error ? err.message : "tag update failed"}`
      );
    }
  }

  return { erpUpdated, shopifyUpdated, errors };
}
