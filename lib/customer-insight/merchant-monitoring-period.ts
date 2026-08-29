import { formatAppIsoDate } from "@/lib/format-datetime";

export type MerchantMonitoringPeriodPreset = "today" | "mtd" | "custom";

export type MerchantMonitoringPeriod = {
  preset: MerchantMonitoringPeriodPreset;
  fromYmd: string;
  toYmd: string;
  periodEndYmd: string;
  periodLabel: string;
};

export type ResolveMerchantMonitoringPeriodInput = {
  fromYmd: string;
  toYmd: string;
  preset?: MerchantMonitoringPeriodPreset;
  todayYmd?: string;
};

export class MerchantMonitoringPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MerchantMonitoringPeriodError";
  }
}

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function monthStartYmd(todayYmd: string): string {
  return `${todayYmd.slice(0, 7)}-01`;
}

function inferPreset(
  fromYmd: string,
  toYmd: string,
  todayYmd: string
): MerchantMonitoringPeriodPreset {
  if (fromYmd === todayYmd && toYmd === todayYmd) return "today";
  const mtdFrom = monthStartYmd(todayYmd);
  if (fromYmd === mtdFrom && toYmd === todayYmd) return "mtd";
  return "custom";
}

function formatCustomLabel(fromYmd: string, toYmd: string): string {
  if (fromYmd === toYmd) return fromYmd;
  return `${fromYmd} – ${toYmd}`;
}

export function resolveMerchantMonitoringPeriod(
  input: ResolveMerchantMonitoringPeriodInput
): MerchantMonitoringPeriod {
  const todayYmd = input.todayYmd ?? formatAppIsoDate(new Date());
  if (!isValidYmd(input.fromYmd) || !isValidYmd(input.toYmd)) {
    throw new MerchantMonitoringPeriodError("Expected YYYY-MM-DD dates");
  }
  let fromYmd = input.fromYmd;
  let toYmd = input.toYmd;
  if (toYmd > todayYmd) toYmd = todayYmd;
  if (fromYmd > toYmd) {
    throw new MerchantMonitoringPeriodError("fromYmd cannot be after toYmd");
  }
  const preset = input.preset ?? inferPreset(fromYmd, toYmd, todayYmd);
  const periodLabel =
    preset === "today"
      ? "Today"
      : preset === "mtd"
        ? "MTD"
        : formatCustomLabel(fromYmd, toYmd);
  return {
    preset,
    fromYmd,
    toYmd,
    periodEndYmd: toYmd,
    periodLabel,
  };
}

export function defaultMtdPeriod(todayYmd?: string): MerchantMonitoringPeriod {
  const today = todayYmd ?? formatAppIsoDate(new Date());
  return resolveMerchantMonitoringPeriod({
    fromYmd: monthStartYmd(today),
    toYmd: today,
    preset: "mtd",
    todayYmd: today,
  });
}
