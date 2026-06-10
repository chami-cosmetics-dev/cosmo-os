import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import NetInfo from "@react-native-community/netinfo";
import { flushQueuedRequest } from "@/src/api/client";
import { clearQueue, getQueue, replaceQueue, type QueuedAction } from "@/src/storage/offline-queue";
import { hasActiveSession, useAuth } from "@/src/providers/auth";

type SyncContextValue = {
  pendingCount: number;
  queuedActions: QueuedAction[];
  flushQueue: () => Promise<void>;
  clearPendingQueue: () => Promise<void>;
  refreshPendingQueue: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [queuedActions, setQueuedActions] = useState<QueuedAction[]>([]);

  async function refreshPendingQueue() {
    const queue = await getQueue();
    setPendingCount(queue.length);
    setQueuedActions(queue);
  }

  async function flushQueue() {
    if (!hasActiveSession(session)) return;

    const queue = await getQueue();
    const remaining = [];

    for (const item of queue) {
      const ok = await flushQueuedRequest({
        tenant: item.tenant,
        endpoint: item.endpoint,
        method: item.method,
        body: item.body,
      });

      if (!ok) {
        remaining.push(item);
      }
    }

    await replaceQueue(remaining);
    setPendingCount(remaining.length);
    setQueuedActions(remaining);
  }

  async function clearPendingQueue() {
    await clearQueue();
    setPendingCount(0);
    setQueuedActions([]);
  }

  useEffect(() => {
    void refreshPendingQueue();
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        void flushQueue();
      }
    });
    return unsubscribe;
  }, [session]);

  const value = useMemo(
    () => ({
      pendingCount,
      queuedActions,
      flushQueue,
      clearPendingQueue,
      refreshPendingQueue,
    }),
    [pendingCount, queuedActions, session]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within SyncProvider");
  }
  return context;
}
