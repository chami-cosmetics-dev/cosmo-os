import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TenantId } from "@/src/tenants/config";
import { getDeliveryKey } from "@/src/tenants/config";
import { isTenantId } from "@/src/tenants/config";

const COMPLETED_DELIVERIES_KEY = "cosmo-rider-completed-deliveries";

export type CompletedDelivery = {
  tenant: TenantId;
  id: string;
  orderLabel: string;
  amount: string;
  completedAt: string;
  customerName: string | null;
  companyLocation?: { name: string } | null;
  companyLabel?: string;
};

function isValidCompletedDelivery(value: unknown): value is CompletedDelivery {
  if (!value || typeof value !== "object") return false;

  const candidate = value as {
    tenant?: unknown;
    id?: unknown;
    orderLabel?: unknown;
    amount?: unknown;
    completedAt?: unknown;
  };

  return (
    isTenantId(typeof candidate.tenant === "string" ? candidate.tenant : undefined) &&
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.orderLabel === "string" &&
    candidate.orderLabel.trim().length > 0 &&
    typeof candidate.amount === "string" &&
    candidate.amount.trim().length > 0 &&
    typeof candidate.completedAt === "string" &&
    candidate.completedAt.trim().length > 0
  );
}

export async function listCompletedDeliveries() {
  const raw = await AsyncStorage.getItem(COMPLETED_DELIVERIES_KEY);
  const parsed = raw ? (JSON.parse(raw) as unknown) : [];
  const items = Array.isArray(parsed) ? parsed.filter(isValidCompletedDelivery) : [];
  if (raw && items.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
    await AsyncStorage.setItem(COMPLETED_DELIVERIES_KEY, JSON.stringify(items));
  }
  return items;
}

export async function upsertCompletedDelivery(delivery: CompletedDelivery) {
  const current = await listCompletedDeliveries();
  const key = getDeliveryKey(delivery.tenant, delivery.id);
  const next = [
    delivery,
    ...current.filter((item) => getDeliveryKey(item.tenant, item.id) !== key),
  ];
  await AsyncStorage.setItem(COMPLETED_DELIVERIES_KEY, JSON.stringify(next));
  return next;
}

export { getDeliveryKey };
