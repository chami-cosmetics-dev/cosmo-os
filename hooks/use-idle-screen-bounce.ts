"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Position = { x: number; y: number };

const DEFAULT_IDLE_MS = 60_000;
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
  "pointerdown",
] as const;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** After `idleMs` without input, move a fixed element around the viewport (DVD-style). */
export function useIdleScreenBounce(options: { enabled: boolean; idleMs?: number }) {
  const { enabled, idleMs = DEFAULT_IDLE_MS } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isBouncing, setIsBouncing] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const lastActivityRef = useRef(0);
  const isBouncingRef = useRef(false);
  const velocityRef = useRef({ vx: 2.8, vy: 2.2 });
  const positionRef = useRef<Position>({ x: 0, y: 0 });

  const stopBouncing = useCallback(() => {
    isBouncingRef.current = false;
    setIsBouncing(false);
    setPosition(null);
  }, []);

  const startBouncing = useCallback(() => {
    const el = containerRef.current;
    if (!el || isBouncingRef.current) return;

    const rect = el.getBoundingClientRect();
    positionRef.current = { x: rect.left, y: rect.top };
    velocityRef.current = {
      vx: (Math.random() > 0.5 ? 1 : -1) * (2.4 + Math.random() * 1.2),
      vy: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random()),
    };
    isBouncingRef.current = true;
    setPosition({ ...positionRef.current });
    setIsBouncing(true);
  }, []);

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) {
      stopBouncing();
      return;
    }

    lastActivityRef.current = Date.now();

    const markActive = () => {
      lastActivityRef.current = Date.now();
      if (isBouncingRef.current) stopBouncing();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }

    const onVisibility = () => {
      if (document.hidden) {
        stopBouncing();
      } else {
        lastActivityRef.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const idleCheck = window.setInterval(() => {
      if (document.hidden || !enabled) return;
      if (isBouncingRef.current) return;
      if (Date.now() - lastActivityRef.current >= idleMs) {
        startBouncing();
      }
    }, 1000);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(idleCheck);
    };
  }, [enabled, idleMs, startBouncing, stopBouncing]);

  useEffect(() => {
    if (!isBouncing) return;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (ts: number) => {
      const dt = Math.min(ts - lastTs, 32) / 16;
      lastTs = ts;

      const el = containerRef.current;
      if (!el) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const rect = el.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - rect.width);
      const maxY = Math.max(0, window.innerHeight - rect.height);

      let { x, y } = positionRef.current;
      let { vx, vy } = velocityRef.current;

      x += vx * dt;
      y += vy * dt;

      if (x <= 0) {
        x = 0;
        vx = Math.abs(vx);
      } else if (x >= maxX) {
        x = maxX;
        vx = -Math.abs(vx);
      }

      if (y <= 0) {
        y = 0;
        vy = Math.abs(vy);
      } else if (y >= maxY) {
        y = maxY;
        vy = -Math.abs(vy);
      }

      velocityRef.current = { vx, vy };
      positionRef.current = { x, y };
      setPosition({ x, y });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isBouncing]);

  return { containerRef, isBouncing, position };
}
