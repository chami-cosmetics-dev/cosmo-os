import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveBankTransferMopName } from "@/lib/payment-gateway-match";

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
  { key: "mintpay", label: "Mintpay", field: "mintpayMop" as const },
  { key: "citypak", label: "City Pak", field: "citypakMop" as const },
] as const;

type ErpInstanceMops = {
  cashMop: string | null;
  codMop: string | null;
  cardDeliveryMop: string | null;
  bankTransferMop: string | null;
  kokoMop: string | null;
  webxpayMop: string | null;
  mintpayMop: string | null;
  citypakMop: string | null;
};

function mopNameKey(mopName: string): string {
  return mopName.trim().toLowerCase();
}

/** Prefer ALL-CAPS ERP mop ids (e.g. KOKO) over mixed/title case duplicates. */
function preferMopCasing(candidate: string, current: string): boolean {
  const candUpper = candidate === candidate.toUpperCase();
  const curUpper = current === current.toUpperCase();
  return candUpper && !curUpper;
}

function pushUniqueMop(options: ErpPaymentModeOption[], option: ErpPaymentModeOption): void {
  const key = mopNameKey(option.mopName);
  const existingIdx = options.findIndex((o) => mopNameKey(o.mopName) === key);
  if (existingIdx >= 0) {
    const existing = options[existingIdx]!;
    if (preferMopCasing(option.mopName, existing.mopName)) {
      options[existingIdx] = { ...option, key: existing.key };
    }
    return;
  }
  options.push(option);
}

export function listErpPaymentModesFromInstance(
  instance: ErpInstanceMops | null | undefined,
): ErpPaymentModeOption[] {
  if (!instance) return [];

  const options: ErpPaymentModeOption[] = [];

  for (const def of MOP_FIELD_DEFS) {
    const raw = instance[def.field]?.trim();
    if (!raw) continue;
    const mopName =
      def.field === "bankTransferMop" ? resolveBankTransferMopName(raw, { envValue: null }) : raw;
    if (!mopName) continue;
    pushUniqueMop(options, { key: def.key, label: def.label, mopName });
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
      mintpayMop: true,
      citypakMop: true,
    },
  });

  const options: ErpPaymentModeOption[] = [];

  for (const instance of instances) {
    for (const option of listErpPaymentModesFromInstance(instance)) {
      pushUniqueMop(options, option);
    }
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function isAllowedCompanyErpPaymentMode(
  modes: ErpPaymentModeOption[],
  mopName: string,
): boolean {
  const key = mopNameKey(mopName);
  return modes.some((mode) => mopNameKey(mode.mopName) === key);
}
