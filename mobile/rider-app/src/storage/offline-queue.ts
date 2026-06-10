import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TenantId } from "@/src/tenants/config";

const QUEUE_KEY = "cosmo-rider-offline-queue";

export type QueuedAction = {
  id: string;
  tenant: TenantId;
  endpoint: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  createdAt: string;
};

export async function getQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const parsed = raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  return parsed.filter((item) => typeof item.tenant === "string" && item.tenant.length > 0);
}

export async function queueAction(action: Omit<QueuedAction, "id" | "createdAt">) {
  const queue = await getQueue();
  const next: QueuedAction = {
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, next]));
  return next;
}

export async function replaceQueue(queue: QueuedAction[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
