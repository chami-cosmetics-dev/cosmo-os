import { cn } from "@/lib/utils";

export function LogStatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone =
    status === "sent"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : status.startsWith("skipped")
        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";

  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        tone,
        className,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function LogSourcePill({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const tone =
    source === "manual" || source === "preview_test"
      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        tone,
        className,
      )}
    >
      {source.replace(/_/g, " ")}
    </span>
  );
}
