import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import {
  findErpCustomerNameByPhone,
  getErpContactSyncInstances,
  setErpCustomerGroup,
  type ErpInstanceForContactSync,
} from "@/lib/erpnext-contact-sync";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import {
  applyShopifyLoyaltyTag,
  normalizeShopifyStoreHandle,
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
  /** ERP slots where Customer was not found (e.g. `erp2`). */
  missingErpSlots: string[];
  /** True when push skipped because Customer missing on one+ ERP. */
  blockedForMissingErp: boolean;
};

export function missingErpLoyaltyMessage(
  missingErpSlots: string[],
  phone?: string | null
): string {
  const labels = missingErpSlots
    .map((s) => s.toUpperCase())
    .join(" and ");
  const phoneBit = phone?.trim() ? ` for phone ${phone.trim()}` : "";
  return `Create this customer in ${labels} first${phoneBit}, then retry Send.`;
}

async function resolveErpCustomersByPhone(
  instances: ErpInstanceForContactSync[],
  phone: string
): Promise<{
  found: Array<{ instance: ErpInstanceForContactSync; customerName: string }>;
  missingSlots: string[];
  errors: string[];
}> {
  const found: Array<{ instance: ErpInstanceForContactSync; customerName: string }> =
    [];
  const missingSlots: string[] = [];
  const errors: string[] = [];

  for (const instance of instances) {
    try {
      const name = await findErpCustomerNameByPhone(instance.cfg, phone);
      if (!name) {
        missingSlots.push(instance.slot);
        continue;
      }
      found.push({ instance, customerName: name });
    } catch (err) {
      errors.push(
        `${instance.slot}: ${err instanceof Error ? err.message : "ERP lookup failed"}`
      );
    }
  }

  return { found, missingSlots, errors };
}

export type LoyaltyErpPreflight = {
  primaryPhone: string | null;
  missingErpSlots: string[];
  errors: string[];
};

/** Lookup-only: which ERP slots lack a Customer for this contact phone. */
export async function preflightLoyaltyErpCustomers(input: {
  companyId: string;
  contactId: string;
}): Promise<LoyaltyErpPreflight> {
  const contact = await prisma.contactMaster.findFirst({
    where: { id: input.contactId, companyId: input.companyId },
    select: { id: true, phoneNumber: true },
  });
  if (!contact) {
    return {
      primaryPhone: null,
      missingErpSlots: [],
      errors: ["Contact not found"],
    };
  }
  const phones = await listContactPhones(contact.id, contact.phoneNumber);
  const primaryPhone = phones[0] ?? contact.phoneNumber;
  const instances = await getErpContactSyncInstances(input.companyId);
  if (instances.length === 0) {
    return {
      primaryPhone,
      missingErpSlots: [],
      errors: ["No ERP instances configured"],
    };
  }
  if (!primaryPhone) {
    return {
      primaryPhone: null,
      missingErpSlots: instances.map((i) => i.slot),
      errors: ["No phone to match ERP Customer"],
    };
  }
  const resolved = await resolveErpCustomersByPhone(instances, primaryPhone);
  return {
    primaryPhone,
    missingErpSlots: resolved.missingSlots,
    errors: resolved.errors,
  };
}

/**
 * Explicit assign send: ERP customer_group + Shopify loyalty tags.
 * Never called from automatic ERP→OS pull.
 *
 * If Customer missing on any configured ERP, blocks all updates and returns
 * `blockedForMissingErp` so UI can tell staff to create Customer first, then retry.
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
    return {
      erpUpdated: 0,
      shopifyUpdated: 0,
      errors: ["Contact not found"],
      missingErpSlots: [],
      blockedForMissingErp: false,
    };
  }

  const phones = await listContactPhones(contact.id, contact.phoneNumber);
  const emails = await listContactEmails(contact.id, contact.email);
  const primaryPhone = phones[0] ?? contact.phoneNumber;
  const primaryEmail = emails[0] ?? contact.email;

  const instances = await getErpContactSyncInstances(input.companyId);
  if (instances.length === 0) {
    errors.push("No ERP instances configured");
  } else if (!primaryPhone) {
    errors.push("No phone to match ERP Customer");
  } else {
    const resolved = await resolveErpCustomersByPhone(instances, primaryPhone);
    errors.push(...resolved.errors);

    if (resolved.missingSlots.length > 0) {
      const msg = missingErpLoyaltyMessage(resolved.missingSlots, primaryPhone);
      errors.push(msg);
      for (const slot of resolved.missingSlots) {
        errors.push(`${slot}: ERP Customer not found`);
      }
      return {
        erpUpdated: 0,
        shopifyUpdated: 0,
        errors,
        missingErpSlots: resolved.missingSlots,
        blockedForMissingErp: true,
      };
    }

    for (const { instance, customerName } of resolved.found) {
      try {
        const ok = await setErpCustomerGroup(
          instance.cfg,
          customerName,
          targets.erpGroup
        );
        if (ok) erpUpdated += 1;
        else {
          errors.push(
            `${instance.slot}: failed to set customer_group ${targets.erpGroup}`
          );
        }
      } catch (err) {
        errors.push(
          `${instance.slot}: ${err instanceof Error ? err.message : "ERP update failed"}`
        );
      }
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
        .map((h) => normalizeShopifyStoreHandle(h.shopifyAdminStoreHandle ?? ""))
        .filter((h): h is string => Boolean(h))
    ),
  ];

  if (storeHandles.length === 0) {
    errors.push(
      "No Shopify store configured (set shopifyAdminStoreHandle on a company location)"
    );
    return {
      erpUpdated,
      shopifyUpdated,
      errors,
      missingErpSlots: [],
      blockedForMissingErp: false,
    };
  }

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
  const shopifyIdsFromOs = [
    ...new Set(
      osCustomers
        .map((c) => c.shopifyCustomerId?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];

  for (const storeHandle of storeHandles) {
    try {
      let ids = [...shopifyIdsFromOs];
      if (ids.length === 0) {
        const found = await searchShopifyCustomerId({
          storeHandle,
          phone: primaryPhone,
          email: primaryEmail,
        });
        if (found) ids = [found];
      }
      if (ids.length === 0) {
        errors.push(
          `Shopify ${storeHandle}: customer not found (tried email/phone variants)`
        );
        continue;
      }
      for (const shopifyCustomerId of ids) {
        const result = await applyShopifyLoyaltyTag({
          storeHandle,
          shopifyCustomerId,
          tier: input.tier,
        });
        if (result.ok) shopifyUpdated += 1;
        else {
          // OS id may be stale — fall back to live search once
          const found = await searchShopifyCustomerId({
            storeHandle,
            phone: primaryPhone,
            email: primaryEmail,
          });
          if (found && found !== shopifyCustomerId.replace(/\D/g, "")) {
            const retry = await applyShopifyLoyaltyTag({
              storeHandle,
              shopifyCustomerId: found,
              tier: input.tier,
            });
            if (retry.ok) {
              shopifyUpdated += 1;
              continue;
            }
            errors.push(
              `Shopify ${storeHandle}: ${retry.error ?? "tag update failed"}`
            );
          } else {
            errors.push(
              `Shopify ${storeHandle}: ${result.error ?? "tag update failed"}`
            );
          }
        }
      }
    } catch (err) {
      errors.push(
        `Shopify ${storeHandle}: ${err instanceof Error ? err.message : "tag update failed"}`
      );
    }
  }

  return {
    erpUpdated,
    shopifyUpdated,
    errors,
    missingErpSlots: [],
    blockedForMissingErp: false,
  };
}
