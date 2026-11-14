import NetInfo from "@react-native-community/netinfo";

import { ApiError, apiClient } from "@/src/api/client";
import { queueAction, type QueuedStep } from "@/src/storage/offline-queue";
import type { TenantId } from "@/src/tenants/config";

async function isLikelyOnline() {
  const net = await NetInfo.fetch().catch(() => null);
  return net == null || net.isConnected !== false;
}

function shouldQueueError(error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
    return false;
  }
  return true;
}

/** Run one or more POSTs together. Offline / 5xx → one queue job (steps stay ordered). */
export async function submitOrQueueSteps(params: {
  tenant: TenantId;
  steps: QueuedStep[];
  queuedMessage: string;
}) {
  if (params.steps.length === 0) {
    return { mode: "live" as const };
  }

  if (await isLikelyOnline()) {
    try {
      for (const step of params.steps) {
        await apiClient.post(params.tenant, step.endpoint, step.body);
      }
      return { mode: "live" as const };
    } catch (error) {
      if (!shouldQueueError(error)) throw error;
    }
  }

  await queueAction({
    tenant: params.tenant,
    steps: params.steps,
  });
  return { mode: "queued" as const, message: params.queuedMessage };
}

export async function submitOrQueue(params: {
  tenant: TenantId;
  endpoint: string;
  body: Record<string, unknown>;
  queuedMessage: string;
}) {
  return submitOrQueueSteps({
    tenant: params.tenant,
    steps: [{ endpoint: params.endpoint, method: "POST", body: params.body }],
    queuedMessage: params.queuedMessage,
  });
}
