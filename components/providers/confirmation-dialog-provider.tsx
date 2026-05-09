"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

type ConfirmationContextValue = {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
};

const ConfirmationDialogContext = createContext<ConfirmationContextValue | null>(null);

export function ConfirmationDialogProvider({ children }: { children: ReactNode }) {
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const [open, setOpen] = useState(false);

  const closeWithValue = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
    setOptions(null);
  }, []);

  const confirm = useCallback((nextOptions: ConfirmationOptions) => {
    setOptions(nextOptions);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmationDialogContext.Provider value={value}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeWithValue(false);
        }}
      >
        <AlertDialogContent className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_97%,white),color-mix(in_srgb,var(--secondary)_8%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))]">
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title ?? "Are you sure?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {options?.description ?? "Please confirm this action."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/70 bg-background/85 hover:bg-secondary/10">
              {options?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={options?.variant ?? "default"}
              onClick={() => closeWithValue(true)}
            >
              {options?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmationDialogContext.Provider>
  );
}

export function useConfirmationDialog() {
  const context = useContext(ConfirmationDialogContext);
  if (!context) {
    throw new Error("useConfirmationDialog must be used within ConfirmationDialogProvider");
  }
  return context;
}
