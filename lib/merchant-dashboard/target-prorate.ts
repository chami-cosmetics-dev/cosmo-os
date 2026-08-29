import {
  APP_TIME_ZONE,
  formatAppIsoDate,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";

/** Mon–Sat working week (Sunday off) in Asia/Colombo. */
export function isWorkingDayYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
  }).format(parseAppCalendarDayStart(ymd) ?? new Date(`${ymd}T12:00:00+05:30`));
  return weekday !== "Sun";
}

export function addDaysYmd(ymd: string, days: number): string {
  const start = parseAppCalendarDayStart(ymd);
  if (!start) return ymd;
  const next = new Date(start.getTime() + days * 86_400_000);
  return formatAppIsoDate(next);
}

export function countWorkingDaysBetween(fromYmd: string, toYmd: string): number {
  if (fromYmd > toYmd) return 0;
  let count = 0;
  let cur = fromYmd;
  while (cur <= toYmd) {
    if (isWorkingDayYmd(cur)) count += 1;
    cur = addDaysYmd(cur, 1);
  }
  return count;
}

export function monthBoundsYmd(yearMonth: string): {
  fromYmd: string;
  toYmd: string;
} {
  const [y, m] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    fromYmd: `${yearMonth}-01`,
    toYmd: `${yearMonth}-${String(daysInMonth).padStart(2, "0")}`,
  };
}

export function countWorkingDaysInMonth(yearMonth: string): number {
  const { fromYmd, toYmd } = monthBoundsYmd(yearMonth);
  return countWorkingDaysBetween(fromYmd, toYmd);
}

/** Spread a monthly target across working days in the month. */
export function prorateMonthlyTargetForPeriod(input: {
  monthlyTarget: number | null;
  yearMonth: string;
  fromYmd: string;
  toYmd: string;
}): number | null {
  if (input.monthlyTarget == null || input.monthlyTarget <= 0) return null;

  const { fromYmd: monthStart, toYmd: monthEnd } = monthBoundsYmd(
    input.yearMonth,
  );
  const workingDaysInMonth = countWorkingDaysInMonth(input.yearMonth);
  if (workingDaysInMonth <= 0) return null;

  const periodFrom =
    input.fromYmd < monthStart ? monthStart : input.fromYmd;
  const periodTo = input.toYmd > monthEnd ? monthEnd : input.toYmd;
  if (periodFrom > periodTo) return null;

  const workingDaysInPeriod = countWorkingDaysBetween(periodFrom, periodTo);
  if (workingDaysInPeriod <= 0) return null;

  const amount =
    (input.monthlyTarget * workingDaysInPeriod) / workingDaysInMonth;
  return Math.round(amount * 100) / 100;
}

export function dailyWorkingTarget(monthlyTarget: number | null, yearMonth: string) {
  if (monthlyTarget == null || monthlyTarget <= 0) return null;
  const workingDays = countWorkingDaysInMonth(yearMonth);
  if (workingDays <= 0) return null;
  return Math.round((monthlyTarget / workingDays) * 100) / 100;
}
