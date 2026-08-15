export const DUMP_TOTAL_HEADER = "X-Dump-Total";

export function parseDumpTotalHeader(value: string | null) {
  const total = Number(value);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

export function parseContentDispositionFilename(value: string | null) {
  if (!value) return null;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1]);
    } catch {
      return utf[1];
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(value);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(value);
  return plain?.[1]?.trim().replace(/^["']|["']$/g, "") ?? null;
}

export function createCsvRowCounter() {
  let inQuotes = false;
  let rows = 0;
  return {
    consume(text: string) {
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (!inQuotes && ch === "\n") {
          rows += 1;
        }
      }
    },
    dataRows() {
      return Math.max(0, rows - 1);
    },
  };
}

export function dumpProgressPercent(dataRows: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(99, Math.round((dataRows / total) * 100));
}
