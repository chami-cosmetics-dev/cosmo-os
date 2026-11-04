"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTIVE_OUTLET_SESSION_KEY } from "@/lib/active-outlet-client";
import { notify } from "@/lib/notify";

type OutletOption = { id: string; name: string };

type ActiveOutletPayload = {
  assignedOutlets: OutletOption[];
  activeOutlet: OutletOption | null;
  todayKey: string;
  needsSelection: boolean;
};

export function ActiveOutletGate() {
  const [open, setOpen] = useState(false);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [active, setActive] = useState<OutletOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [switchMode, setSwitchMode] = useState(false);

  const applySession = useCallback((todayKey: string, outletId: string) => {
    try {
      sessionStorage.setItem(
        ACTIVE_OUTLET_SESSION_KEY,
        JSON.stringify({ todayKey, outletId }),
      );
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const readSession = useCallback((): { todayKey: string; outletId: string } | null => {
    try {
      const raw = sessionStorage.getItem(ACTIVE_OUTLET_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { todayKey?: string; outletId?: string };
      if (!parsed.todayKey || !parsed.outletId) return null;
      return { todayKey: parsed.todayKey, outletId: parsed.outletId };
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(
    async (opts?: { forceAsk?: boolean }) => {
      try {
        const res = await fetch("/api/me/active-outlet");
        if (!res.ok) {
          setReady(true);
          return;
        }
        const data = (await res.json()) as ActiveOutletPayload;
        setOutlets(data.assignedOutlets ?? []);
        setActive(data.activeOutlet);
        setSelectedId(data.activeOutlet?.id ?? data.assignedOutlets[0]?.id ?? "");

        if ((data.assignedOutlets?.length ?? 0) <= 1) {
          if (data.activeOutlet && data.todayKey) {
            applySession(data.todayKey, data.activeOutlet.id);
          }
          setOpen(false);
          setReady(true);
          return;
        }

        const session = readSession();
        const sessionOk =
          session &&
          session.todayKey === data.todayKey &&
          data.assignedOutlets.some((o) => o.id === session.outletId);

        const mustAsk =
          Boolean(opts?.forceAsk) ||
          data.needsSelection ||
          !sessionOk;

        if (mustAsk) {
          setSwitchMode(Boolean(opts?.forceAsk) && !data.needsSelection);
          setOpen(true);
        } else {
          setOpen(false);
        }
      } catch {
        /* non-blocking */
      } finally {
        setReady(true);
      }
    },
    [applySession, readSession],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onSwitch() {
      void load({ forceAsk: true });
    }
    window.addEventListener("cosmo:switch-outlet", onSwitch);
    return () => window.removeEventListener("cosmo:switch-outlet", onSwitch);
  }, [load]);

  async function confirmOutlet() {
    if (!selectedId) {
      notify.error("Pick an outlet to continue");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/me/active-outlet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId: selectedId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        activeOutlet?: OutletOption;
        todayKey?: string;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Could not save outlet");
        return;
      }
      if (data.activeOutlet && data.todayKey) {
        applySession(data.todayKey, data.activeOutlet.id);
        setActive(data.activeOutlet);
      }
      setOpen(false);
      setSwitchMode(false);
      notify.success(
        data.activeOutlet
          ? `Working at ${data.activeOutlet.name} today`
          : "Outlet saved",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready || outlets.length <= 1) {
    return null;
  }

  return (
    <>
      {active && !open ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-40 hidden sm:block">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border/70 bg-card/95 px-3 py-2 text-sm shadow-md backdrop-blur">
            <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Today:</span>
            <span className="font-medium text-foreground">{active.name}</span>
            <button
              type="button"
              className="text-primary text-xs font-semibold underline-offset-2 hover:underline"
              onClick={() => void load({ forceAsk: true })}
            >
              Switch
            </button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          // Blocking when required; allow dismiss only in switch mode.
          if (!next && switchMode) {
            setOpen(false);
            setSwitchMode(false);
          }
        }}
      >
        <DialogContent
          className="bg-card text-card-foreground sm:max-w-md"
          showCloseButton={switchMode}
          onPointerDownOutside={(e) => {
            if (!switchMode) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!switchMode) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="size-5" aria-hidden />
              {switchMode
                ? "Switch outlet"
                : "Which outlet are you working at today?"}
            </DialogTitle>
            <DialogDescription>
              {switchMode
                ? "Pick the floor shop for requests, receive, and transfers."
                : "Choose your shop for today. Book notes still let you pick any assigned outlet per sheet."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <Select
              value={selectedId || undefined}
              onValueChange={setSelectedId}
              disabled={busy}
            >
              <SelectTrigger className="bg-background text-foreground w-full">
                <SelectValue placeholder="Select outlet" />
              </SelectTrigger>
              <SelectContent className="bg-card text-card-foreground">
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              className="w-full"
              disabled={busy || !selectedId}
              onClick={() => void confirmOutlet()}
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Saving...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
