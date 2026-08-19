/**
 * RFC-style CSV records. Quoted fields may contain commas and newlines.
 * Line-at-a-time parsers drop Adapt WEB ORDER rows when email has a newline.
 *
 * Dirty Adapt dumps also leave quotes unclosed inside `json_value`. A pure RFC
 * parser then slurps the rest of the file. File iteration recovers when the next
 * physical line looks like a new invoice (`"12345",...`).
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const MAX_FIELD_CHARS = 8_000_000;

/** True when a physical line starts a new Adapt invoice row. */
export function looksLikeAdaptRecordStart(line: string): boolean {
  const t = line.replace(/^\ufeff/, "").trimStart();
  return /^"\d{2,}"[,;]/.test(t) || /^\d{2,}[,;]/.test(t);
}

export class CsvRecordParser {
  private current = "";
  private row: string[] = [];
  private quoted = false;
  private pendingCR = false;

  get inQuotes(): boolean {
    return this.quoted;
  }

  push(chunk: string): string[][] {
    const out: string[][] = [];
    let i = 0;

    if (this.pendingCR) {
      if (chunk[0] === "\n") i = 1;
      this.pendingCR = false;
      this.flushRecord(out);
    }

    for (; i < chunk.length; i += 1) {
      const ch = chunk[i]!;

      if (this.quoted) {
        if (ch === '"') {
          if (chunk[i + 1] === '"') {
            this.current += '"';
            i += 1;
          } else {
            this.quoted = false;
          }
        } else {
          this.current += ch;
          if (this.current.length > MAX_FIELD_CHARS) {
            this.quoted = false;
            this.flushRecord(out);
          }
        }
        continue;
      }

      if (ch === '"') {
        this.quoted = true;
        continue;
      }
      if (ch === ",") {
        this.row.push(this.current);
        this.current = "";
        continue;
      }
      if (ch === "\r") {
        if (i === chunk.length - 1) {
          this.pendingCR = true;
          break;
        }
        if (chunk[i + 1] === "\n") i += 1;
        this.flushRecord(out);
        continue;
      }
      if (ch === "\n") {
        this.flushRecord(out);
        continue;
      }
      this.current += ch;
    }

    return out;
  }

  /** Close a stuck quote and emit the row so the next invoice can parse. */
  forceComplete(): string[][] {
    const out: string[][] = [];
    this.quoted = false;
    this.pendingCR = false;
    this.flushRecord(out);
    return out;
  }

  end(): string[][] {
    const out: string[][] = [];
    if (this.pendingCR) {
      this.pendingCR = false;
      this.flushRecord(out);
    }
    if (this.current.length > 0 || this.row.length > 0 || this.quoted) {
      this.quoted = false;
      this.flushRecord(out);
    }
    return out;
  }

  private flushRecord(out: string[][]) {
    this.row.push(this.current);
    this.current = "";
    const row = this.row;
    this.row = [];
    if (row.every((cell) => cell.trim() === "")) return;
    out.push(row);
  }
}

export function parseCsvRecords(text: string): string[][] {
  const parser = new CsvRecordParser();
  const records = parser.push(text);
  records.push(...parser.end());
  return records;
}

export async function* iterateCsvRecordsFromFile(
  filePath: string
): AsyncGenerator<string[]> {
  const parser = new CsvRecordParser();
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (parser.inQuotes && looksLikeAdaptRecordStart(line)) {
      for (const record of parser.forceComplete()) yield record;
    }
    for (const record of parser.push(`${line}\n`)) yield record;
  }
  for (const record of parser.end()) yield record;
}
