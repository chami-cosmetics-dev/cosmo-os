import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "cosmo-rider-offline-queue";

export type QueuedAction = {
  id: string;
  endpoint: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  createdAt: string;
};

export async function getQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
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
