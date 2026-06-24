"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type TaskReminderSafeAreaContextValue = {
  setReminderHudVisible: (visible: boolean) => void;
};

const TaskReminderSafeAreaContext = createContext<TaskReminderSafeAreaContextValue | null>(null);

export function TaskReminderSafeAreaProvider({ children }: { children: ReactNode }) {
  const [reminderHudVisible, setReminderHudVisible] = useState(false);

  const value = useMemo(
    () => ({
      setReminderHudVisible,
    }),
    [],
  );

  return (
    <TaskReminderSafeAreaContext.Provider value={value}>
      <div
        data-reminder-hud={reminderHudVisible ? "active" : undefined}
        className={cn(
          "min-w-0 flex-1 p-4 transition-[padding] duration-300",
          reminderHudVisible && "pb-40 pr-36 sm:pr-40",
        )}
      >
        {children}
      </div>
    </TaskReminderSafeAreaContext.Provider>
  );
}

export function useTaskReminderSafeArea() {
  const context = useContext(TaskReminderSafeAreaContext);
  if (!context) {
    throw new Error("useTaskReminderSafeArea must be used within TaskReminderSafeAreaProvider");
  }
  return context;
}
