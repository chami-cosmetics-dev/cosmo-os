"use client";

import { useCallback, useState } from "react";

import {
  buildFocusListCsv,
  downloadCsv,
  movementToFocusExport,
  type FocusExportRow,
} from "@/lib/item-trends/export";
import type { ItemMovementRow } from "@/lib/item-trends/types";

const STORAGE_KEY = "item-trends-focus-list";

function readPinnedFromSession(): FocusExportRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FocusExportRow[]) : [];
  } catch {
    return [];
  }
}

export function useFocusList() {
  const [pinned, setPinned] = useState<FocusExportRow[]>(readPinnedFromSession);

  const persist = useCallback((rows: FocusExportRow[]) => {
    setPinned(rows);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, []);

  const isPinned = useCallback((sku: string) => pinned.some((r) => r.sku === sku), [pinned]);

  const togglePin = useCallback(
    (row: ItemMovementRow, context: string) => {
      if (isPinned(row.sku)) {
        persist(pinned.filter((r) => r.sku !== row.sku));
      } else {
        persist([...pinned, movementToFocusExport(row, context)]);
      }
    },
    [isPinned, persist, pinned],
  );

  const unpin = useCallback(
    (sku: string) => persist(pinned.filter((r) => r.sku !== sku)),
    [persist, pinned],
  );

  const exportCsv = useCallback(() => {
    if (pinned.length === 0) return;
    downloadCsv(
      `item-trends-focus-${new Date().toISOString().slice(0, 10)}.csv`,
      buildFocusListCsv(pinned),
    );
  }, [pinned]);

  return { pinned, isPinned, togglePin, unpin, exportCsv };
}
