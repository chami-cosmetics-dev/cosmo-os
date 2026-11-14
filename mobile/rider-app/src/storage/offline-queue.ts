import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TenantId } from "@/src/tenants/config";

const QUEUE_KEY = "cosmo-rider-offline-queue";

export type QueuedStep = {
  endpoint: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
};

export type QueuedAction = {
  id: string;
  tenant: TenantId;
  createdAt: string;
  /** Steps run in order (e.g. payment then complete). Resume from nextStepIndex. */
  steps: QueuedStep[];
  nextStepIndex: number;
};

function normalizeQueuedAction(raw: unknown): QueuedAction | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<QueuedAction> & {
    endpoint?: string;
    method?: "POST" | "PATCH";
    body?: Record<string, unknown>;
  };
  if (typeof item.tenant !== "string" || item.tenant.length === 0) return null;

  if (Array.isArray(item.steps) && item.steps.length > 0) {
    return {
      id: typeof item.id === "string" ? item.id : `${Date.now()}`,
      tenant: item.tenant as TenantId,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      steps: item.steps.filter(
        (step): step is QueuedStep =>
          !!step &&
          typeof step.endpoint === "string" &&
          (step.method === "POST" || step.method === "PATCH") &&
          !!step.body &&
          typeof step.body === "object"
      ),
      nextStepIndex:
        typeof item.nextStepIndex === "number" && item.nextStepIndex >= 0 ? item.nextStepIndex : 0,
    };
  }

  // Legacy single-request queue rows.
  if (typeof item.endpoint === "string" && item.body && typeof item.body === "object") {
    return {
      id: typeof item.id === "string" ? item.id : `${Date.now()}`,
      tenant: item.tenant as TenantId,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      steps: [
        {
          endpoint: item.endpoint,
          method: item.method === "PATCH" ? "PATCH" : "POST",
          body: item.body,
        },
      ],
      nextStepIndex: 0,
    };
  }

  return null;
}

export async function getQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const parsed = raw ? (JSON.parse(raw) as unknown[]) : [];
  return parsed
    .map(normalizeQueuedAction)
    .filter((item): item is QueuedAction => item != null && item.steps.length > 0);
}

export async function queueAction(action: {
  tenant: TenantId;
  steps: QueuedStep[];
}) {
  const queue = await getQueue();
  const next: QueuedAction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenant: action.tenant,
    createdAt: new Date().toISOString(),
    steps: action.steps,
    nextStepIndex: 0,
  };
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, next]));
  return next;
}

/** @deprecated Prefer queueAction({ tenant, steps }) for multi-step jobs. */
export async function queueLegacyAction(action: {
  tenant: TenantId;
  endpoint: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
}) {
  return queueAction({
    tenant: action.tenant,
    steps: [{ endpoint: action.endpoint, method: action.method, body: action.body }],
  });
}

export async function replaceQueue(queue: QueuedAction[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export function queuedActionTouchesDelivery(action: QueuedAction, deliveryId: string) {
  return action.steps.some((step) => step.endpoint.includes(deliveryId));
}
