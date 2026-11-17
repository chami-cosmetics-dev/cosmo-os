import {
  matchesMerchantAllocation,
  type ViewerIdentity,
} from "@/lib/customer-insight/ownership";
import { getMerchantDisplayName } from "@/lib/merchant-groups";
import { prisma } from "@/lib/prisma";

export type AllocatedMerchantContact = {
  userId: string | null;
  merchantName: string;
  merchantPhone: string;
};

/**
 * Resolve ContactMaster.assignedMerchant string to a company User + mobile.
 */
export async function resolveAllocatedMerchantContact(
  companyId: string,
  assignedMerchant: string | null | undefined,
): Promise<AllocatedMerchantContact> {
  const label = (assignedMerchant ?? "").trim();
  if (!label) {
    return { userId: null, merchantName: "", merchantPhone: "" };
  }

  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true,
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
      mobile: true,
    },
  });

  for (const user of users) {
    const viewer: ViewerIdentity = {
      knownName: user.knownName,
      name: user.name,
      email: user.email,
      couponCodes: user.couponCodes,
    };
    if (!matchesMerchantAllocation(viewer, label)) continue;
    return {
      userId: user.id,
      merchantName: getMerchantDisplayName(user),
      merchantPhone: (user.mobile ?? "").trim(),
    };
  }

  // No User match — still show the allocation label as merchant name
  return { userId: null, merchantName: label, merchantPhone: "" };
}

/** Pure helper for unit tests — match against an in-memory user list. */
export function matchAllocatedMerchantFromUsers(
  assignedMerchant: string | null | undefined,
  users: Array<{
    id: string;
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
    mobile?: string | null;
  }>,
): AllocatedMerchantContact {
  const label = (assignedMerchant ?? "").trim();
  if (!label) {
    return { userId: null, merchantName: "", merchantPhone: "" };
  }
  for (const user of users) {
    const viewer: ViewerIdentity = {
      knownName: user.knownName,
      name: user.name,
      email: user.email,
      couponCodes: user.couponCodes,
    };
    if (!matchesMerchantAllocation(viewer, label)) continue;
    return {
      userId: user.id,
      merchantName: getMerchantDisplayName(user),
      merchantPhone: (user.mobile ?? "").trim(),
    };
  }
  return { userId: null, merchantName: label, merchantPhone: "" };
}
