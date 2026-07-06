"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const STORAGE_KEY = "cosmo-task-reminder-bottom";
const DRAG_THRESHOLD_PX = 6;
const EDGE_PADDING_PX = 16;
const DEFAULT_BOTTOM_PX = 24;

function readSavedBottom(): number | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  const value = Number(saved);
  return Number.isFinite(value) ? value : null;
}

function clampBottom(bottomPx: number, elementHeight: number) {
  const maxBottom = Math.max(EDGE_PADDING_PX, window.innerHeight - elementHeight - EDGE_PADDING_PX);
  return Math.min(Math.max(bottomPx, EDGE_PADDING_PX), maxBottom);
}

type DragSession = {
  pointerId: number;
  startY: number;
  startBottom: number;
  moved: boolean;
};

/** Click-and-drag vertically; quick tap without movement is a separate click. */
export function useVerticalDragPosition(enabled = true) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const bottomRef = useRef(DEFAULT_BOTTOM_PX);
  const [bottomPx, setBottomPx] = useState(DEFAULT_BOTTOM_PX);
  const [isDragging, setIsDragging] = useState(false);

  const applyBottom = useCallback((nextBottom: number) => {
    const height = containerRef.current?.getBoundingClientRect().height ?? 0;
    const clamped = clampBottom(nextBottom, height);
    bottomRef.current = clamped;
    setBottomPx(clamped);
    return clamped;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const saved = readSavedBottom();
    if (saved !== null) {
      requestAnimationFrame(() => {
        applyBottom(saved);
      });
    }
  }, [applyBottom, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => {
      applyBottom(bottomRef.current);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [applyBottom, enabled]);

  useEffect(() => {
    bottomRef.current = bottomPx;
  }, [bottomPx]);

  useEffect(() => {
    const onResize = () => {
      applyBottom(bottomRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyBottom]);

  const onDragHandlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    sessionRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startBottom: bottomRef.current,
      moved: false,
    };
  }, []);

  const onDragHandlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      const deltaY = session.startY - event.clientY;
      if (!session.moved && Math.abs(deltaY) >= DRAG_THRESHOLD_PX) {
        session.moved = true;
        setIsDragging(true);
      }

      if (session.moved) {
        event.preventDefault();
        applyBottom(session.startBottom + deltaY);
      }
    },
    [applyBottom],
  );

  const endDragSession = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      sessionRef.current = null;
      setIsDragging(false);

      if (session.moved) {
        window.localStorage.setItem(STORAGE_KEY, String(bottomRef.current));
        return { dragged: true as const };
      }

      return { dragged: false as const };
    },
    [],
  );

  const onDragHandlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => endDragSession(event),
    [endDragSession],
  );

  const onDragHandlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      endDragSession(event);
    },
    [endDragSession],
  );

  return {
    containerRef,
    bottomPx,
    isDragging,
    onDragHandlePointerDown,
    onDragHandlePointerMove,
    onDragHandlePointerUp,
    onDragHandlePointerCancel,
  };
}
