import "server-only";

import { prisma } from "@/lib/prisma";

export type ErpPaymentModeOption = {
  key: string;
  label: string;
  mopName: string;
};

const MOP_FIELD_DEFS = [
  { key: "cash", label: "Cash", field: "cashMop" as const },
  { key: "cod", label: "Cash on delivery", field: "codMop" as const },
  { key: "card_delivery", label: "Card on delivery", field: "cardDeliveryMop" as const },
  { key: "bank_transfer", label: "Bank transfer", field: "bankTransferMop" as const },
  { key: "koko", label: "KOKO", field: "kokoMop" as const },
  { key: "webxpay", label: "WebXPay", field: "webxpayMop" as const },
] as const;

type ErpInstanceMops = {
  cashMop: string | null;
  codMop: string | null;
  cardDeliveryMop: string | null;
  bankTransferMop: string | null;
  kokoMop: string | null;
  webxpayMop: string | null;
};

export function listErpPaymentModesFromInstance(
  instance: ErpInstanceMops | null | undefined,
): ErpPaymentModeOption[] {
  if (!instance) return [];

  const seen = new Set<string>();
  const options: ErpPaymentModeOption[] = [];

  for (const def of MOP_FIELD_DEFS) {
    const mopName = instance[def.field]?.trim();
    if (!mopName || seen.has(mopName)) continue;
    seen.add(mopName);
    options.push({ key: def.key, label: def.label, mopName });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export async function listCompanyErpPaymentModes(companyId: string): Promise<ErpPaymentModeOption[]> {
  const instances = await prisma.erpnextInstance.findMany({
    where: {
      locations: { some: { companyId } },
    },
    select: {
      cashMop: true,
      codMop: true,
      cardDeliveryMop: true,
      bankTransferMop: true,
      kokoMop: true,
      webxpayMop: true,
    },
  });

  const seen = new Set<string>();
  const options: ErpPaymentModeOption[] = [];

  for (const instance of instances) {
    for (const option of listErpPaymentModesFromInstance(instance)) {
      if (seen.has(option.mopName)) continue;
      seen.add(option.mopName);
      options.push(option);
    }
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function isAllowedCompanyErpPaymentMode(
  modes: ErpPaymentModeOption[],
  mopName: string,
): boolean {
  const normalized = mopName.trim();
  return modes.some((mode) => mode.mopName === normalized);
}
