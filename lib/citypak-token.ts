import { prisma } from "@/lib/prisma";

function readPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Token for waybill PDF / track. Location creds first, then saved prefix accounts. */
export async function resolveCitypakApiToken(input: {
  companyId: string;
  payload: Record<string, unknown>;
  locationId?: string | null;
}): Promise<string | null> {
  const accountDbId = readPayloadString(input.payload, "citypakAccountDbId");
  if (accountDbId) {
    const account = await prisma.citypakAccount.findFirst({
      where: { id: accountDbId, companyId: input.companyId },
      select: { apiToken: true },
    });
    if (account?.apiToken) return account.apiToken;
  }

  const locationId = input.locationId?.trim() || readPayloadString(input.payload, "citypakLocationId");
  if (locationId) {
    const location = await prisma.companyLocation.findFirst({
      where: { id: locationId, companyId: input.companyId },
      select: { citypakApiToken: true },
    });
    if (location?.citypakApiToken) return location.citypakApiToken;
  }

  const accountId = readPayloadString(input.payload, "citypakAccountId");
  if (!accountId) return null;

  const account = await prisma.citypakAccount.findFirst({
    where: { companyId: input.companyId, accountId },
    select: { apiToken: true },
  });
  if (account?.apiToken) return account.apiToken;

  const location = await prisma.companyLocation.findFirst({
    where: { companyId: input.companyId, citypakAccountId: accountId },
    select: { citypakApiToken: true },
  });
  return location?.citypakApiToken ?? null;
}
