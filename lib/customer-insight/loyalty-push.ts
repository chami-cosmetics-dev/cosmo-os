import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import {
  defaultErpCompanyForInstance,
  ensureErpCustomerByPhone,
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
  erpCreated: number;
  shopifyUpdated: number;
  errors: string[];
  /** ERP slots still missing after create attempt (e.g. `erp2`). */
  missingErpSlots: string[];
  /** True when a missing Customer could not be created on one+ ERP. */
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
  return `Could not create this customer in ${labels}${phoneBit}. Retry Send after ERP is reachable.`;
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

/** Create only on slots that lookup confirmed missing. Never create after a lookup error. */
export function loyaltyErpSlotsToCreate(input: {
  instanceSlots: Array<"erp1" | "erp2">;
  foundSlots: Array<"erp1" | "erp2">;
  missingSlots: string[];
  errorSlots: Array<"erp1" | "erp2">;
}): Array<"erp1" | "erp2"> {
  const found = new Set(input.foundSlots);
  const missing = new Set(input.missingSlots);
  const errored = new Set(input.errorSlots);
  return input.instanceSlots.filter(
    (slot) => missing.has(slot) && !found.has(slot) && !errored.has(slot)
  );
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
 * Missing ERP Customer: create on that slot only (phone lookup first), then set
 * Gold/Platinum. Lookup errors skip create (fail closed). Duplicate POST treated
 * as existing. OS ContactMaster is never created here.
 *
 * If a missing Customer still cannot be created, blocks Shopify and returns
 * `blockedForMissingErp` so OS assign can wait for retry.
 */
export async function pushLoyaltyAssignmentToErpAndShopify(input: {
  companyId: string;
  contactId: string;
  tier: "gold" | "platinum";
}): Promise<LoyaltyPushResult> {
  const targets = loyaltyExternalTargets(input.tier);
  const errors: string[] = [];
  let erpUpdated = 0;
  let erpCreated = 0;
  let shopifyUpdated = 0;

  const contact = await prisma.contactMaster.findFirst({
    where: { id: input.contactId, companyId: input.companyId },
    select: { id: true, name: true, phoneNumber: true, email: true },
  });
  if (!contact) {
    return {
      erpUpdated: 0,
      erpCreated: 0,
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
  let remainingMissingSlots: string[] = [];
  if (instances.length === 0) {
    errors.push("No ERP instances configured");
  } else if (!primaryPhone) {
    errors.push("No phone to match ERP Customer");
  } else {
    const resolved = await resolveErpCustomersByPhone(instances, primaryPhone);
    errors.push(...resolved.errors);

    const foundBySlot = new Set(resolved.found.map((row) => row.instance.slot));
    const errorSlots = resolved.errors
      .map((err) => {
        const slot = err.split(":")[0]?.trim();
        return slot === "erp1" || slot === "erp2" ? slot : null;
      })
      .filter((slot): slot is "erp1" | "erp2" => Boolean(slot));

    const toUpdate = [...resolved.found];
    const slotsToCreate = new Set(
      loyaltyErpSlotsToCreate({
        instanceSlots: instances.map((instance) => instance.slot),
        foundSlots: resolved.found.map((row) => row.instance.slot),
        missingSlots: resolved.missingSlots,
        errorSlots,
      })
    );

    for (const instance of instances) {
      if (!slotsToCreate.has(instance.slot)) continue;
      try {
        const defaultCompany = await defaultErpCompanyForInstance(
          input.companyId,
          instance.id
        );
        const ensured = await ensureErpCustomerByPhone(instance.cfg, {
          phone: primaryPhone,
          displayName: contact.name,
          email: primaryEmail,
          customerGroup: targets.erpGroup,
          defaultCompany,
        });
        toUpdate.push({ instance, customerName: ensured.customerName });
        foundBySlot.add(instance.slot);
        if (ensured.created) erpCreated += 1;
      } catch (err) {
        remainingMissingSlots.push(instance.slot);
        errors.push(
          `${instance.slot}: ${err instanceof Error ? err.message : "ERP create failed"}`
        );
      }
    }

    remainingMissingSlots = [
      ...new Set([
        ...remainingMissingSlots,
        ...resolved.missingSlots.filter((slot) => !foundBySlot.has(slot)),
        ...errorSlots.filter((slot) => !foundBySlot.has(slot)),
      ]),
    ];

    if (remainingMissingSlots.length > 0) {
      errors.push(missingErpLoyaltyMessage(remainingMissingSlots, primaryPhone));
      return {
        erpUpdated,
        erpCreated,
        shopifyUpdated: 0,
        errors,
        missingErpSlots: remainingMissingSlots,
        blockedForMissingErp: true,
      };
    }

    for (const { instance, customerName } of toUpdate) {
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
      erpCreated,
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
    erpCreated,
    shopifyUpdated,
    errors,
    missingErpSlots: [],
    blockedForMissingErp: false,
  };
}
