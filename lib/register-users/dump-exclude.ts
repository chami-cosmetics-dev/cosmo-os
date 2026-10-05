export type OsRegistrationDumpContact = {
  osRegistrationCreated?: boolean | null;
  lastPurchaseAt?: Date | string | null;
  purchaseOrderCount?: number | null;
};

/** Omit OS-created contacts until they have a purchase. */
export function shouldExcludeOsRegistrationFromDump(
  contact: OsRegistrationDumpContact,
): boolean {
  const created = contact.osRegistrationCreated === true;
  const noLastPurchase = contact.lastPurchaseAt == null || contact.lastPurchaseAt === "";
  const noOrders = (contact.purchaseOrderCount ?? 0) === 0;
  return created && noLastPurchase && noOrders;
}

/** Prisma `AND` fragment: exclude OS-created no-purchase contacts. */
export function osRegistrationDumpExcludeWhere() {
  return {
    NOT: {
      AND: [
        { osRegistrationCreated: true },
        { lastPurchaseAt: null },
        { purchaseOrderCount: 0 },
      ],
    },
  };
}
