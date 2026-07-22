/** Pad day/month/year to DD/MM/YYYY. */
function toDdmmyyyy(day: number, month: number, year: number): string | null {
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/**
 * Progressive typing helper. Supports DDMM… and YYYYMM… digit entry.
 * When 8 digits form a valid date, returns normalized DD/MM/YYYY.
 */
export function formatDateTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length === 8) {
    return normalizeStickerDate(digits) ?? digits;
  }
  const yPrefix = digits.length >= 4 ? Number(digits.slice(0, 4)) : 0;
  if (yPrefix >= 1900 && yPrefix <= 2100) {
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) {
      return `${digits.slice(0, 4)}/${digits.slice(4)}`;
    }
    return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
  }
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Normalize sticker date input to DD/MM/YYYY when valid.
 * Accepts DD/MM/YYYY, YYYYMMDD, and DDMMYYYY (8 digits).
 */
export function normalizeStickerDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const ymdSlash = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlash) {
    return toDdmmyyyy(
      Number(ymdSlash[3]),
      Number(ymdSlash[2]),
      Number(ymdSlash[1])
    );
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return toDdmmyyyy(
      Number(slashMatch[1]),
      Number(slashMatch[2]),
      Number(slashMatch[3])
    );
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  // YYYYMMDD if starts with 19xx/20xx
  const yyyy = Number(digits.slice(0, 4));
  if (yyyy >= 1900 && yyyy <= 2100) {
    const asYyyymmdd = toDdmmyyyy(
      Number(digits.slice(6, 8)),
      Number(digits.slice(4, 6)),
      yyyy
    );
    if (asYyyymmdd) return asYyyymmdd;
  }

  // DDMMYYYY
  return toDdmmyyyy(
    Number(digits.slice(0, 2)),
    Number(digits.slice(2, 4)),
    Number(digits.slice(4, 8))
  );
}

/** Parse DD/MM/YYYY to Date (local), or null. */
export function parseDDMMYYYY(value: string): Date | null {
  const normalized = normalizeStickerDate(value);
  if (!normalized) return null;
  const [dd, mm, yyyy] = normalized.split("/").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

/** EPD = MFD + 3 calendar years, as DD/MM/YYYY. */
export function expireFromManufacture(mfd: string): string | null {
  const date = parseDDMMYYYY(mfd);
  if (!date) return null;
  date.setFullYear(date.getFullYear() + 3);
  return toDdmmyyyy(date.getDate(), date.getMonth() + 1, date.getFullYear());
}
