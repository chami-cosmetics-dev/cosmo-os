import NetInfo from "@react-native-community/netinfo";

import { apiClient } from "@/src/api/client";
import { queueAction } from "@/src/storage/offline-queue";
import type { TenantId } from "@/src/tenants/config";

export async function submitOrQueue(params: {
  tenant: TenantId;
  endpoint: string;
  body: Record<string, unknown>;
  queuedMessage: string;
}) {
  const net = await NetInfo.fetch();
  const isOnline = !!net.isConnected && !!net.isInternetReachable;

  if (isOnline) {
    try {
      await apiClient.post(params.tenant, params.endpoint, params.body);
      return { mode: "live" as const };
    } catch {
      // Fall back to offline queue when the live request fails.
    }
  }

  await queueAction({
    tenant: params.tenant,
    endpoint: params.endpoint,
    method: "POST",
    body: params.body,
  });
  return { mode: "queued" as const, message: params.queuedMessage };
}
