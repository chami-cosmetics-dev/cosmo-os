export const PROTECTED_SYSTEMS = ["vault", "cosmo-dev", "cosmo-prod"] as const;

export type ProtectedSystem = (typeof PROTECTED_SYSTEMS)[number];

export type RetentionClass = "daily" | "weekly" | "monthly";

const COLOMBO = "Asia/Colombo";

export function isProtectedSystem(value: string): value is ProtectedSystem {
  return (PROTECTED_SYSTEMS as readonly string[]).includes(value);
}

export function parseProtectedSystem(value: string): ProtectedSystem {
  if (!isProtectedSystem(value)) {
    throw new Error(`Invalid protected system: ${value}`);
  }
  return value;
}

/** Compact UTC stamp: `YYYYMMDDTHHmmssZ` */
export function formatDumpTimestamp(takenAt: Date): string {
  const iso = takenAt.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function objectKey(
  system: ProtectedSystem,
  retentionClass: RetentionClass,
  takenAt: Date,
): string {
  const stamp = formatDumpTimestamp(takenAt);
  return `${retentionClass}/${system}/${system}-${stamp}.dump.age`;
}

export function statusObjectKey(system: ProtectedSystem): string {
  return `status/${system}.json`;
}

export function systemFromObjectKey(key: string): ProtectedSystem {
  const parts = key.split("/");
  const systemPart = parts[1];
  if (!systemPart) {
    throw new Error(`Object key missing system segment: ${key}`);
  }
  return parseProtectedSystem(systemPart);
}

function colomboParts(takenAt: Date): { weekday: string; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: COLOMBO,
    weekday: "short",
    day: "numeric",
  }).formatToParts(takenAt);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "0");
  return { weekday, day };
}

/** Daily always. Vault + cosmo-prod also weekly on Colombo Sunday and monthly on day 1. */
export function retentionClassesFor(
  system: ProtectedSystem,
  takenAt: Date,
): RetentionClass[] {
  const classes: RetentionClass[] = ["daily"];
  if (system === "cosmo-dev") {
    return classes;
  }
  const { weekday, day } = colomboParts(takenAt);
  if (weekday === "Sun") {
    classes.push("weekly");
  }
  if (day === 1) {
    classes.push("monthly");
  }
  return classes;
}

export type DumpKeyPlan = {
  system: ProtectedSystem;
  takenAt: string;
  dailyKey: string;
  weeklyKey: string | null;
  monthlyKey: string | null;
  statusKey: string;
};

export function buildDumpKeyPlan(
  system: ProtectedSystem,
  takenAt: Date = new Date(),
): DumpKeyPlan {
  const classes = new Set(retentionClassesFor(system, takenAt));
  return {
    system,
    takenAt: takenAt.toISOString(),
    dailyKey: objectKey(system, "daily", takenAt),
    weeklyKey: classes.has("weekly") ? objectKey(system, "weekly", takenAt) : null,
    monthlyKey: classes.has("monthly")
      ? objectKey(system, "monthly", takenAt)
      : null,
    statusKey: statusObjectKey(system),
  };
}
