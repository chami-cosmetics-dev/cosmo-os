"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { TASK_REMINDER_SLA_HOURS } from "@/lib/task-reminder-sla";

const HUD_PARTICLES = [
  { className: "left-[4%] top-[20%]", delay: "0s" },
  { className: "right-[2%] top-[35%]", delay: "0.5s" },
  { className: "left-[12%] bottom-[18%]", delay: "1s" },
  { className: "right-[14%] bottom-[8%]", delay: "1.5s" },
] as const;

function formatHudClock(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

type TaskReminderBubbleIconProps = {
  count: number;
  active?: boolean;
  className?: string;
};

export function TaskReminderBubbleIcon({ count, active = false, className }: TaskReminderBubbleIconProps) {
  const label = count > 99 ? "99+" : String(count);
  const [clock, setClock] = useState("--:--");

  useEffect(() => {
    const tick = () => setClock(formatHudClock(new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      className={cn("relative inline-flex size-[6.25rem] items-center justify-center", className)}
      aria-hidden
    >
      <span className="reminder-holo-alert-ring pointer-events-none absolute inset-[-4px] rounded-full border-2 border-red-500/50" />
      <span className="reminder-holo-pulse pointer-events-none absolute inset-[-8px] rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.35),rgba(34,211,238,0.35)_40%,transparent_70%)] blur-lg" />

      {HUD_PARTICLES.map((particle, index) => (
        <span
          key={index}
          className={cn(
            "reminder-holo-particle pointer-events-none absolute size-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_#22d3ee]",
            particle.className,
          )}
          style={{ animationDelay: particle.delay }}
        />
      ))}

      <span
        className={cn(
          "reminder-holo-float relative flex size-[5.25rem] items-center justify-center rounded-full",
          active && "scale-105",
        )}
      >
        <span className="reminder-holo-orbit pointer-events-none absolute inset-0 rounded-full border border-dashed border-cyan-400/50" />
        <span className="reminder-holo-orbit-reverse pointer-events-none absolute inset-[8px] rounded-full border border-cyan-300/30" />

        <span
          className={cn(
            "relative flex size-[4.5rem] items-center justify-center overflow-hidden rounded-full",
            "border border-cyan-300/55 bg-[radial-gradient(circle_at_30%_25%,rgba(34,211,238,0.4),rgba(15,23,42,0.55)_55%,rgba(2,6,23,0.88))]",
            "shadow-[0_0_28px_rgba(34,211,238,0.5),0_0_56px_rgba(59,130,246,0.3),0_0_20px_rgba(239,68,68,0.2),inset_0_0_22px_rgba(34,211,238,0.14)]",
            "backdrop-blur-sm",
          )}
        >
          <span className="reminder-holo-scan pointer-events-none absolute inset-x-0 h-[2px] bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.9),transparent)] opacity-80" />
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.24),transparent_55%)]" />
          <span className="pointer-events-none absolute inset-[18%] rounded-full border border-cyan-200/25" />

          <span className="pointer-events-none absolute top-[12%] left-[12%] size-3 border-t-2 border-l-2 border-cyan-300/80" />
          <span className="pointer-events-none absolute top-[12%] right-[12%] size-3 border-t-2 border-r-2 border-cyan-300/80" />
          <span className="pointer-events-none absolute bottom-[12%] left-[12%] size-3 border-b-2 border-l-2 border-cyan-300/80" />
          <span className="pointer-events-none absolute right-[12%] bottom-[12%] size-3 border-r-2 border-b-2 border-cyan-300/80" />

          <span className="relative z-10 flex flex-col items-center leading-none">
            <span className="font-mono text-[10px] tracking-[0.28em] text-cyan-200/80 uppercase">SLA</span>
            <span className="reminder-holo-clock mt-0.5 font-mono text-base font-bold tracking-wider text-cyan-50">
              {clock}
            </span>
            <span className="mt-1 font-mono text-[9px] font-bold tracking-widest text-red-400">
              {TASK_REMINDER_SLA_HOURS}H+
            </span>
          </span>
        </span>
      </span>

      <span
        className={cn(
          "absolute -top-1 -right-1 z-20 flex min-w-[2rem] items-center justify-center rounded-md px-1.5 py-1",
          "border-2 border-red-300/90 bg-[linear-gradient(180deg,#ef4444,#b91c1c)]",
          "font-mono text-sm font-extrabold leading-none text-white",
          "shadow-[0_0_16px_rgba(239,68,68,0.85),0_0_28px_rgba(239,68,68,0.45)]",
          "reminder-holo-badge-red",
        )}
      >
        {label}
      </span>
    </span>
  );
}
