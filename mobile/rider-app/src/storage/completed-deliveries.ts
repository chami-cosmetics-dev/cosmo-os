import AsyncStorage from "@react-native-async-storage/async-storage";

const COMPLETED_DELIVERIES_KEY = "cosmo-rider-completed-deliveries";

export type CompletedDelivery = {
  id: string;
  orderLabel: string;
  amount: string;
  completedAt: string;
  customerName: string | null;
  companyLocation?: { name: string } | null;
};

function isValidCompletedDelivery(value: unknown): value is CompletedDelivery {
  if (!value || typeof value !== "object") return false;

  const candidate = value as {
    id?: unknown;
    orderLabel?: unknown;
    amount?: unknown;
    completedAt?: unknown;
  };

  return (
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
  const next = [delivery, ...current.filter((item) => item.id !== delivery.id)];
  await AsyncStorage.setItem(COMPLETED_DELIVERIES_KEY, JSON.stringify(next));
  return next;
}
