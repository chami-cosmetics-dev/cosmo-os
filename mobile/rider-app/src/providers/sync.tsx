import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import NetInfo from "@react-native-community/netinfo";
import { API_BASE_URL } from "@/src/config";
import { clearQueue, getQueue, replaceQueue, type QueuedAction } from "@/src/storage/offline-queue";
import { loadSession } from "@/src/storage/session";

type SyncContextValue = {
  pendingCount: number;
  queuedActions: QueuedAction[];
  flushQueue: () => Promise<void>;
  clearPendingQueue: () => Promise<void>;
  refreshPendingQueue: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: PropsWithChildren) {
  const [pendingCount, setPendingCount] = useState(0);
  const [queuedActions, setQueuedActions] = useState<QueuedAction[]>([]);

  async function refreshPendingQueue() {
    const queue = await getQueue();
    setPendingCount(queue.length);
    setQueuedActions(queue);
  }

  async function flushQueue() {
    const session = await loadSession();
    if (!session?.accessToken) return;

    const queue = await getQueue();
    const remaining = [];

    for (const item of queue) {
      try {
        const response = await fetch(`${API_BASE_URL}${item.endpoint}`, {
          method: item.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify(item.body),
        });

        if (!response.ok) {
          remaining.push(item);
        }
      } catch {
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
  }, []);

  const value = useMemo(
    () => ({
      pendingCount,
      queuedActions,
      flushQueue,
      clearPendingQueue,
      refreshPendingQueue,
    }),
    [pendingCount, queuedActions]
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
