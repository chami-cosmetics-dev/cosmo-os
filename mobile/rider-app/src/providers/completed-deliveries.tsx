import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import {
  listCompletedDeliveries,
  upsertCompletedDelivery,
  type CompletedDelivery,
} from "@/src/storage/completed-deliveries";

type CompletedDeliveriesContextValue = {
  completedDeliveries: CompletedDelivery[];
  markCompleted: (delivery: CompletedDelivery) => Promise<void>;
};

const CompletedDeliveriesContext = createContext<CompletedDeliveriesContextValue | null>(null);

export function CompletedDeliveriesProvider({ children }: PropsWithChildren) {
  const [completedDeliveries, setCompletedDeliveries] = useState<CompletedDelivery[]>([]);

  useEffect(() => {
    listCompletedDeliveries().then(setCompletedDeliveries).catch(() => setCompletedDeliveries([]));
  }, []);

  const value = useMemo<CompletedDeliveriesContextValue>(
    () => ({
      completedDeliveries,
      markCompleted: async (delivery) => {
        const next = await upsertCompletedDelivery(delivery);
        setCompletedDeliveries(next);
      },
    }),
    [completedDeliveries]
  );

  return <CompletedDeliveriesContext.Provider value={value}>{children}</CompletedDeliveriesContext.Provider>;
}

export function useCompletedDeliveries() {
  const context = useContext(CompletedDeliveriesContext);
  if (!context) {
    throw new Error("useCompletedDeliveries must be used within CompletedDeliveriesProvider");
  }
  return context;
}
